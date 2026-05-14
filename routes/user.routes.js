import express from "express";
import { prisma } from "../lib/prisma.js";
// import bcrypt from "bcrypt";
import { verifyToken, isAdmin } from "../middlewares/auth.middleware.js";

const router = express.Router();

// ======================================================
// GET /api/users (AUTHENTICATED USERS: admin and others)
// ======================================================
router.get("/", verifyToken, async (req, res) => {
    try {
        const { page = 1, limit = 10, role, isActive } = req.query;

        // Build where clause for filtering
        const where = {};
        if (role) where.role = role;
        if (isActive !== undefined) where.isActive = isActive === "true";

        // Calculate pagination
        const skip = (page - 1) * limit;

        // Get total count
        const total = await prisma.user.count({ where });

        // Get users
        const users = await prisma.user.findMany({
            where,
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                avatar: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            },
            skip,
            take: parseInt(limit),
            orderBy: { createdAt: "desc" },
        });

        res.status(200).json({
            success: true,
            data: users,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("Get users error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// ======================================================
// GET /api/users/projects (AUTHENTICATED USERS)
// Returns projects the current user is a member of or has assigned tasks in
// Includes recent project tasks and tasks assigned to the user within each project
// ======================================================
router.get("/projects", verifyToken, async (req, res) => {
    try {
        const userId = req.user?.id;

        // Projects where user is a member
        const memberProjects = await prisma.project.findMany({
            where: { members: { some: { userId } } },
            select: {
                id: true,
                title: true,
                description: true,
                color: true,
                progress: true,
                startDate: true,
                endDate: true,
                isArchived: true,
                _count: { select: { members: true, tasks: true } },
            },
        });

        // Projects derived from tasks assigned to the user
        const assignedProjectIdsRaw = await prisma.task.findMany({
            where: { assignedToId: userId },
            select: { projectId: true },
        });
        const assignedProjectIds = [...new Set(assignedProjectIdsRaw.map((p) => p.projectId))].filter(Boolean);

        let assignedProjects = [];
        if (assignedProjectIds.length > 0) {
            assignedProjects = await prisma.project.findMany({
                where: { id: { in: assignedProjectIds } },
                select: {
                    id: true,
                    title: true,
                    description: true,
                    color: true,
                    progress: true,
                    startDate: true,
                    endDate: true,
                    isArchived: true,
                    _count: { select: { members: true, tasks: true } },
                },
            });
        }

        // Merge projects (unique by id)
        const projectsMap = new Map();
        [...memberProjects, ...assignedProjects].forEach((p) => projectsMap.set(p.id, p));
        const projects = Array.from(projectsMap.values());

        // For each project, fetch recent tasks and tasks assigned to the user within that project
        const projectsWithTasks = await Promise.all(
            projects.map(async (proj) => {
                const recentTasks = await prisma.task.findMany({
                    where: { projectId: proj.id },
                    orderBy: { createdAt: "desc" },
                    take: 5,
                    select: { id: true, taskCode: true, title: true, status: true, priority: true, assignedToId: true, dueDate: true, createdAt: true },
                });

                const myTasks = await prisma.task.findMany({
                    where: { projectId: proj.id, assignedToId: userId },
                    orderBy: { createdAt: "desc" },
                    take: 10,
                    select: { id: true, taskCode: true, title: true, status: true, priority: true, dueDate: true, createdAt: true },
                });

                return {
                    ...proj,
                    recentTasks,
                    myTasks,
                    membersCount: proj._count?.members ?? 0,
                    taskCount: proj._count?.tasks ?? 0,
                };
            })
        );

        res.status(200).json({ success: true, projects: projectsWithTasks });
    } catch (error) {
        console.error("Get user projects error:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

// Apply auth and admin middleware to all remaining routes (ADMIN ONLY)
router.use(verifyToken, isAdmin);

// ======================================================
// POST /api/users/create (ADMIN ONLY)
// ======================================================
router.post("/create", async (req, res) => {
    try {
        const { name, email, password, phone, role, avatar } = req.body;

        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Name, email, and password are required",
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters long",
            });
        }

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "User with this email already exists",
            });
        }

        // Hash password
        const hashedPassword = password;

        // Create user
        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role: role || "USER",
                phone,
                avatar,
                isActive: true,
            },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                avatar: true,
                role: true,
                isActive: true,
                createdAt: true,
            },
        });

        res.status(201).json({
            success: true,
            message: "User created successfully",
            user,
        });
    } catch (error) {
        console.error("Create user error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// ======================================================
// GET /api/users (ADMIN ONLY)
// ======================================================
router.get("/", async (req, res) => {
    try {
        const { page = 1, limit = 10, role, isActive } = req.query;

        // Build where clause for filtering
        const where = {};
        if (role) where.role = role;
        if (isActive !== undefined) where.isActive = isActive === "true";

        // Calculate pagination
        const skip = (page - 1) * limit;

        // Get total count
        const total = await prisma.user.count({ where });

        // Get users
        const users = await prisma.user.findMany({
            where,
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                avatar: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            },
            skip,
            take: parseInt(limit),
            orderBy: { createdAt: "desc" },
        });

        res.status(200).json({
            success: true,
            data: users,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("Get users error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// ======================================================
// GET /api/users/:id (ADMIN ONLY)
// ======================================================
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                avatar: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        res.status(200).json({
            success: true,
            user,
        });
    } catch (error) {
        console.error("Get user error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// ======================================================
// PUT /api/users/:id (ADMIN ONLY)
// ======================================================
router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone, avatar } = req.body;

        // Check if user exists
        const user = await prisma.user.findUnique({
            where: { id },
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        // If email is being changed, check if it's already in use
        if (email && email !== user.email) {
            const existingUser = await prisma.user.findUnique({
                where: { email },
            });

            if (existingUser) {
                return res.status(409).json({
                    success: false,
                    message: "Email already in use",
                });
            }
        }

        // Prepare update data
        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (phone !== undefined) updateData.phone = phone;
        if (avatar !== undefined) updateData.avatar = avatar;

        // Update user
        const updatedUser = await prisma.user.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                avatar: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        res.status(200).json({
            success: true,
            message: "User updated successfully",
            user: updatedUser,
        });
    } catch (error) {
        console.error("Update user error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// ======================================================
// PUT /api/users/:id/role (ADMIN ONLY)
// ======================================================
router.put("/:id/role", async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;

        if (!role) {
            return res.status(400).json({
                success: false,
                message: "Role is required",
            });
        }

        // Validate role
        const validRoles = ["USER", "ADMIN"];
        if (!validRoles.includes(role)) {
            return res.status(400).json({
                success: false,
                message: "Invalid role. Allowed roles: USER, ADMIN",
            });
        }

        // Check if user exists
        const user = await prisma.user.findUnique({
            where: { id },
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        // Update user role
        const updatedUser = await prisma.user.update({
            where: { id },
            data: { role },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isActive: true,
            },
        });

        res.status(200).json({
            success: true,
            message: "User role updated successfully",
            user: updatedUser,
        });
    } catch (error) {
        console.error("Update user role error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// ======================================================
// PUT /api/users/:id/deactivate (ADMIN ONLY)
// ======================================================
router.put("/:id/deactivate", async (req, res) => {
    try {
        const { id } = req.params;

        // Check if user exists
        const user = await prisma.user.findUnique({
            where: { id },
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        // Deactivate user
        const updatedUser = await prisma.user.update({
            where: { id },
            data: { isActive: false },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isActive: true,
            },
        });

        res.status(200).json({
            success: true,
            message: "User deactivated successfully",
            user: updatedUser,
        });
    } catch (error) {
        console.error("Deactivate user error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

export default router;
