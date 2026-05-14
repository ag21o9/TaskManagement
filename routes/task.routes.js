import express from "express";
import { prisma } from "../lib/prisma.js";
import { verifyToken, isAdmin } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Create admin router for admin-only operations
const adminRouter = express.Router();
adminRouter.use(verifyToken, isAdmin);

// ======================================================
// ADMIN ONLY ENDPOINTS
// ======================================================

// ======================================================
// POST /api/tasks (ADMIN ONLY)
// ======================================================
adminRouter.post("/", async (req, res) => {
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
        createdBy: req.user.id,
        assignedTo: assignedToId,
        priority: priority || "MEDIUM",
        status: "TODO",
        startDate: startDate ? new Date(startDate) : undefined,
        dueDate: dueDate ? new Date(dueDate) : undefined,
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        assignee: {
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
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        assignee: {
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
// PUT /api/tasks/:taskId/assign (ADMIN ONLY)
// ======================================================
adminRouter.put("/:taskId/assign", async (req, res) => {
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
      data: { assignedTo: assignedToId },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
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
    const where = { isArchived: false };
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
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        assignee: {
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
router.get("/:taskId", verifyToken, async (req, res) => {
  try {
    const { taskId } = req.params;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        assignee: {
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

    // Update status
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        status,
        completedAt: status === "COMPLETED" ? new Date() : null,
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
          },
        },
        assignee: {
          select: {
            id: true,
            name: true,
          },
        },
      },
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
