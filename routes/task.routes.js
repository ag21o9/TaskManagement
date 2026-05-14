import express from "express";
import { prisma } from "../lib/prisma.js";
import { recordTaskActivity } from "../lib/taskActivity.js";
import { verifyToken, isAdmin } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Create admin router for admin-only operations
const adminRouter = express.Router();
adminRouter.use(verifyToken, isAdmin);

const ensureProjectMember = async (projectId, userId) => {
    const existingMember = await prisma.projectMember.findFirst({
        where: { projectId, userId },
    });

    if (!existingMember) {
        await prisma.projectMember.create({
            data: { projectId, userId, role: "MEMBER" },
        });
    }
};

const getAccessibleTaskWhere = async (userId, role) => {
    if (role === "ADMIN") return { isArchived: false };

    const projectIds = await prisma.projectMember.findMany({
        where: { userId },
        select: { projectId: true },
    });

    return {
        isArchived: false,
        projectId: { in: projectIds.map((p) => p.projectId) },
    };
};

// ======================================================
// ADMIN ONLY ENDPOINTS
// ======================================================

// ======================================================
// POST /api/tasks (ADMIN + PROJECT MANAGER/OWNER)
// ======================================================
router.post("/", verifyToken, async (req, res) => {
    try {
        const {
            projectId,
            title,
            description,
            priority,
            assignedToId,
            startDate,
            dueDate,
            estimatedHours,
        } = req.body;

        // Validation
        if (!projectId || !title) {
            return res.status(400).json({
                success: false,
                message: "Project ID and task title are required",
            });
        }

        // Check if project exists
        const project = await prisma.project.findUnique({
            where: { id: projectId },
        });

        if (!project) {
            return res.status(404).json({
                success: false,
                message: "Project not found",
            });
        }

        const canCreateTask =
            req.user.role === "ADMIN" ||
            (await prisma.projectMember.findFirst({
                where: {
                    projectId,
                    userId: req.user.id,
                    role: {
                        in: ["OWNER", "MANAGER"],
                    },
                },
            }));

        if (!canCreateTask) {
            return res.status(403).json({
                success: false,
                message: "Only admins or project managers/owners can create tasks for this project",
            });
        }

        // If assigned user is provided, verify they exist
        if (assignedToId) {
            const assignedUser = await prisma.user.findUnique({
                where: { id: assignedToId },
            });

            if (!assignedUser) {
                return res.status(404).json({
                    success: false,
                    message: "Assigned user not found",
                });
            }
        }

        // Generate task code
        const taskCount = await prisma.task.count({ where: { projectId } });
        const taskCode = `${project.title.substring(0, 3).toUpperCase()}-${taskCount + 1}`;

        // Create task
        const task = await prisma.task.create({
            data: {
                taskCode,
                title,
                description,
                projectId,
                createdById: req.user.id,
                assignedToId: assignedToId,
                priority: priority || "MEDIUM",
                status: "TODO",
                startDate: startDate ? new Date(startDate) : undefined,
                dueDate: dueDate ? new Date(dueDate) : undefined,
            },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                assignedTo: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                project: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
            },
        });

        if (assignedToId) {
            await ensureProjectMember(projectId, assignedToId);
        }

        await recordTaskActivity({
            taskId: task.id,
            userId: req.user.id,
            activityType: "CREATED",
            message: `Task \"${title}\" created`,
            newValue: task.taskCode,
        });

        res.status(201).json({
            success: true,
            message: "Task created successfully",
            task,
        });
    } catch (error) {
        console.error("Create task error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// ======================================================
// PUT /api/tasks/:taskId (ADMIN ONLY)
// ======================================================
adminRouter.put("/:taskId", async (req, res) => {
    try {
        const { taskId } = req.params;
        const { title, description, priority, dueDate, startDate } = req.body;

        // Check if task exists
        const task = await prisma.task.findUnique({
            where: { id: taskId },
        });

        if (!task) {
            return res.status(404).json({
                success: false,
                message: "Task not found",
            });
        }

        // Prepare update data
        const updateData = {};
        if (title !== undefined) updateData.title = title;
        if (description !== undefined) updateData.description = description;
        if (priority !== undefined) updateData.priority = priority;
        if (dueDate !== undefined) updateData.dueDate = new Date(dueDate);
        if (startDate !== undefined) updateData.startDate = new Date(startDate);

        // Update task
        const updatedTask = await prisma.task.update({
            where: { id: taskId },
            data: updateData,
            include: {
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                assignedTo: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                project: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
            },
        });

        await recordTaskActivity({
            taskId,
            userId: req.user.id,
            activityType: "UPDATED",
            message: "Task updated",
            newValue: JSON.stringify(updateData),
        });

        res.status(200).json({
            success: true,
            message: "Task updated successfully",
            task: updatedTask,
        });
    } catch (error) {
        console.error("Update task error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// ======================================================
// POST /api/tasks/:taskId/subtasks (COMMON - assignee/project manager/admin)
// ======================================================
router.post("/:taskId/subtasks", verifyToken, async (req, res) => {
    try {
        const { taskId } = req.params;
        const { title, description, priority, assignedToId, dueDate, startDate, estimatedHours } = req.body;

        if (!title) {
            return res.status(400).json({
                success: false,
                message: "Subtask title is required",
            });
        }

        // Check parent task
        const parentTask = await prisma.task.findUnique({ where: { id: taskId } });
        if (!parentTask) {
            return res.status(404).json({ success: false, message: "Parent task not found" });
        }

        // Permission: admin OR assigned user of parent OR project manager/owner
        const allowed =
            req.user.role === "ADMIN" ||
            parentTask.assignedToId === req.user.id ||
            (await prisma.projectMember.findFirst({
                where: {
                    projectId: parentTask.projectId,
                    userId: req.user.id,
                    role: { in: ["OWNER", "MANAGER"] },
                },
            }));

        if (!allowed) {
            return res.status(403).json({
                success: false,
                message: "Only the parent task assignee, project manager/owner, or admin can create subtasks",
            });
        }

        // If assigned user is provided, verify they exist
        if (assignedToId) {
            const assignedUser = await prisma.user.findUnique({ where: { id: assignedToId } });
            if (!assignedUser) {
                return res.status(404).json({ success: false, message: "Assigned user not found" });
            }
        }

        // Generate task code based on project
        const taskCount = await prisma.task.count({ where: { projectId: parentTask.projectId } });
        const project = await prisma.project.findUnique({ where: { id: parentTask.projectId } });
        const taskCode = `${project?.title?.substring(0, 3).toUpperCase() || 'SUB'}-${taskCount + 1}`;

        // Create subtask
        const subtask = await prisma.task.create({
            data: {
                taskCode,
                title,
                description,
                projectId: parentTask.projectId,
                parentTaskId: taskId,
                createdById: req.user.id,
                subtaskCreatedById: req.user.id,
                assignedToId: assignedToId,
                priority: priority || "MEDIUM",
                status: "TODO",
                startDate: startDate ? new Date(startDate) : undefined,
                dueDate: dueDate ? new Date(dueDate) : undefined,
                estimatedHours: estimatedHours || undefined,
            },
            include: {
                createdBy: { select: { id: true, name: true, email: true } },
                assignedTo: { select: { id: true, name: true, email: true } },
                project: { select: { id: true, title: true } },
            },
        });

        // Ensure assigned user is project member
        if (assignedToId) {
            await ensureProjectMember(parentTask.projectId, assignedToId);
        }

        await recordTaskActivity({
            taskId: subtask.id,
            userId: req.user.id,
            activityType: "CREATED",
            message: `Subtask \"${title}\" created`,
            newValue: subtask.taskCode,
        });

        await recordTaskActivity({
            taskId: parentTask.id,
            userId: req.user.id,
            activityType: "SUBTASK_CREATED",
            message: `Subtask \"${title}\" created under parent task`,
            newValue: subtask.id,
        });

        res.status(201).json({ success: true, message: "Subtask created successfully", task: subtask });
    } catch (error) {
        console.error("Create subtask error:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

// ======================================================
// DELETE /api/tasks/:taskId (ADMIN ONLY)
// ======================================================
adminRouter.delete("/:taskId", async (req, res) => {
    try {
        const { taskId } = req.params;

        // Check if task exists
        const task = await prisma.task.findUnique({
            where: { id: taskId },
        });

        if (!task) {
            return res.status(404).json({
                success: false,
                message: "Task not found",
            });
        }

        // Delete task
        await prisma.task.delete({
            where: { id: taskId },
        });

        res.status(200).json({
            success: true,
            message: "Task deleted successfully",
        });
    } catch (error) {
        console.error("Delete task error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// ======================================================
// PUT /api/tasks/:taskId/assign (ADMIN + PROJECT MANAGER/OWNER + PARENT TASK ASSIGNEE)
// ======================================================
router.put("/:taskId/assign", verifyToken, async (req, res) => {
    try {
        const { taskId } = req.params;
        const { assignedToId } = req.body;

        if (!assignedToId) {
            return res.status(400).json({
                success: false,
                message: "Assigned user ID is required",
            });
        }

        // Check if task exists
        const task = await prisma.task.findUnique({
            where: { id: taskId },
        });

        if (!task) {
            return res.status(404).json({
                success: false,
                message: "Task not found",
            });
        }

        const projectManager = await prisma.projectMember.findFirst({
            where: {
                projectId: task.projectId,
                userId: req.user.id,
                role: { in: ["OWNER", "MANAGER"] },
            },
        });

        let parentAssigneeAllowed = false;
        if (task.parentTaskId) {
            const parentTask = await prisma.task.findUnique({
                where: { id: task.parentTaskId },
                select: { assignedToId: true },
            });
            parentAssigneeAllowed = parentTask?.assignedToId === req.user.id;
        }

        const canAssign = req.user.role === "ADMIN" || Boolean(projectManager) || parentAssigneeAllowed;

        if (!canAssign) {
            return res.status(403).json({
                success: false,
                message: "Only admin, project manager/owner, or the parent task assignee can assign this task",
            });
        }

        // Verify user exists
        const user = await prisma.user.findUnique({
            where: { id: assignedToId },
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        // Update task assignment
        const updatedTask = await prisma.task.update({
            where: { id: taskId },
            data: { assignedToId: assignedToId },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                assignedTo: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });

        await ensureProjectMember(task.projectId, assignedToId);

        await recordTaskActivity({
            taskId,
            userId: req.user.id,
            activityType: "ASSIGNED",
            message: `Task assigned to ${user.name}`,
            oldValue: task.assignedToId || null,
            newValue: assignedToId,
        });

        res.status(200).json({
            success: true,
            message: "Task assigned successfully",
            task: updatedTask,
        });
    } catch (error) {
        console.error("Assign task error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// ======================================================
// PUT /api/tasks/:taskId/archive (ADMIN ONLY)
// ======================================================
adminRouter.put("/:taskId/archive", async (req, res) => {
    try {
        const { taskId } = req.params;
        const { isArchived } = req.body;

        // Check if task exists
        const task = await prisma.task.findUnique({
            where: { id: taskId },
        });

        if (!task) {
            return res.status(404).json({
                success: false,
                message: "Task not found",
            });
        }

        // Archive/unarchive task
        const updatedTask = await prisma.task.update({
            where: { id: taskId },
            data: { isArchived: isArchived || false },
        });

        await recordTaskActivity({
            taskId,
            userId: req.user.id,
            activityType: "UPDATED",
            message: isArchived ? "Task archived" : "Task unarchived",
            newValue: String(Boolean(isArchived)),
        });

        res.status(200).json({
            success: true,
            message: `Task ${isArchived ? "archived" : "unarchived"} successfully`,
            task: updatedTask,
        });
    } catch (error) {
        console.error("Archive task error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// ======================================================
// COMMON ENDPOINTS (ADMIN + USER)
// ======================================================

// ======================================================
// GET /api/tasks (COMMON)
// ======================================================
router.get("/", verifyToken, async (req, res) => {
    try {
        const { page = 1, limit = 10, projectId, status, assignedTo } = req.query;

        // Build where clause
        const accessibleWhere = await getAccessibleTaskWhere(req.user.id, req.user.role);
        const where = { ...accessibleWhere };
        if (projectId) where.projectId = projectId;
        if (status) where.status = status;
        if (assignedTo) where.assignedTo = assignedTo;

        // Calculate pagination
        const skip = (page - 1) * limit;

        // Get total count
        const total = await prisma.task.count({ where });

        // Get tasks
        const tasks = await prisma.task.findMany({
            where,
            include: {
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                assignedTo: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                project: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
            },
            skip,
            take: parseInt(limit),
            orderBy: { createdAt: "desc" },
        });

        res.status(200).json({
            success: true,
            data: tasks,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("Get tasks error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// ======================================================
// GET /api/tasks/:taskId (COMMON)
// ======================================================
// ======================================================
// GET /api/tasks/:taskId/subtasks (COMMON)
// ======================================================
router.get("/:taskId/subtasks", verifyToken, async (req, res) => {
    try {
        const { taskId } = req.params;
        const { page = 1, limit = 20 } = req.query;

        // Check parent task exists
        const parentTask = await prisma.task.findUnique({ where: { id: taskId } });
        if (!parentTask) {
            return res.status(404).json({ success: false, message: "Parent task not found" });
        }

        // Permission: admin or project member
        if (req.user.role !== "ADMIN") {
            const member = await prisma.projectMember.findFirst({
                where: { projectId: parentTask.projectId, userId: req.user.id },
            });
            if (!member) {
                return res.status(403).json({ success: false, message: "You do not have access to these subtasks" });
            }
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const total = await prisma.task.count({ where: { parentTaskId: taskId, isArchived: false } });

        const subtasks = await prisma.task.findMany({
            where: { parentTaskId: taskId, isArchived: false },
            include: {
                createdBy: { select: { id: true, name: true, email: true } },
                assignedTo: { select: { id: true, name: true, email: true } },
            },
            skip,
            take: parseInt(limit),
            orderBy: { createdAt: "desc" },
        });

        res.status(200).json({
            success: true,
            data: subtasks,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit)),
            },
        });
    } catch (error) {
        console.error("Get subtasks error:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

// ======================================================
// GET /api/tasks/:taskId/activities (COMMON)
// ======================================================
router.get("/:taskId/activities", verifyToken, async (req, res) => {
    try {
        const { taskId } = req.params;
        const { page = 1, limit = 20 } = req.query;

        const task = await prisma.task.findUnique({
            where: { id: taskId },
            select: { id: true, projectId: true },
        });

        if (!task) {
            return res.status(404).json({
                success: false,
                message: "Task not found",
            });
        }

        if (req.user.role !== "ADMIN") {
            const projectMember = await prisma.projectMember.findFirst({
                where: {
                    projectId: task.projectId,
                    userId: req.user.id,
                },
            });

            if (!projectMember) {
                return res.status(403).json({
                    success: false,
                    message: "You do not have access to this task activities",
                });
            }
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const total = await prisma.taskActivity.count({ where: { taskId } });

        const activities = await prisma.taskActivity.findMany({
            where: { taskId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        avatar: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
            skip,
            take: parseInt(limit),
        });

        res.status(200).json({
            success: true,
            data: activities,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit)),
            },
        });
    } catch (error) {
        console.error("Get task activities error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

router.get("/:taskId", verifyToken, async (req, res) => {
    try {
        const { taskId } = req.params;

        const task = await prisma.task.findUnique({
            where: { id: taskId },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                assignedTo: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                project: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
            },
        });

        if (!task) {
            return res.status(404).json({
                success: false,
                message: "Task not found",
            });
        }

        if (req.user.role !== "ADMIN") {
            const projectMember = await prisma.projectMember.findFirst({
                where: {
                    projectId: task.projectId,
                    userId: req.user.id,
                },
            });

            if (!projectMember) {
                return res.status(403).json({
                    success: false,
                    message: "You do not have access to this task",
                });
            }
        }

        res.status(200).json({
            success: true,
            task,
        });
    } catch (error) {
        console.error("Get task error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// ======================================================
// PUT /api/tasks/:taskId/status (COMMON)
// ======================================================
router.put("/:taskId/status", verifyToken, async (req, res) => {
    try {
        const { taskId } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({
                success: false,
                message: "Status is required",
            });
        }

        // Check if task exists
        const task = await prisma.task.findUnique({
            where: { id: taskId },
        });

        if (!task) {
            return res.status(404).json({
                success: false,
                message: "Task not found",
            });
        }

        const canUpdateStatus =
            req.user.role === "ADMIN" ||
            task.assignedToId === req.user.id ||
            (await prisma.projectMember.findFirst({
                where: {
                    projectId: task.projectId,
                    userId: req.user.id,
                    role: {
                        in: ["OWNER", "MANAGER"],
                    },
                },
            }));

        if (!canUpdateStatus) {
            return res.status(403).json({
                success: false,
                message: "Only the assigned user, project manager, or admin can update task status",
            });
        }

        // Update status
        const updatedTask = await prisma.task.update({
            where: { id: taskId },
            data: {
                status,
                completedAt: status === "COMPLETED" ? new Date() : null,
            },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                assignedTo: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        const activityType =
            status === "COMPLETED"
                ? "COMPLETED"
                : task.status === "COMPLETED"
                    ? "REOPENED"
                    : "STATUS_CHANGED";

        await recordTaskActivity({
            taskId,
            userId: req.user.id,
            activityType,
            message: `Task status changed from ${task.status} to ${status}`,
            oldValue: task.status,
            newValue: status,
        });

        res.status(200).json({
            success: true,
            message: "Task status updated successfully",
            task: updatedTask,
        });
    } catch (error) {
        console.error("Update task status error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// ======================================================
// PUT /api/tasks/:taskId/progress (COMMON)
// ======================================================
router.put("/:taskId/progress", verifyToken, async (req, res) => {
    try {
        const { taskId } = req.params;
        const { progress } = req.body;

        if (progress === undefined || progress < 0 || progress > 100) {
            return res.status(400).json({
                success: false,
                message: "Progress must be between 0 and 100",
            });
        }

        // Check if task exists
        const task = await prisma.task.findUnique({
            where: { id: taskId },
        });

        if (!task) {
            return res.status(404).json({
                success: false,
                message: "Task not found",
            });
        }

        // Update progress
        const updatedTask = await prisma.task.update({
            where: { id: taskId },
            data: { progress },
        });

        await recordTaskActivity({
            taskId,
            userId: req.user.id,
            activityType: "UPDATED",
            message: `Task progress updated to ${progress}%`,
            newValue: String(progress),
        });

        res.status(200).json({
            success: true,
            message: "Task progress updated successfully",
            task: updatedTask,
        });
    } catch (error) {
        console.error("Update task progress error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// Mount admin routes
router.use(adminRouter);

export default router;
