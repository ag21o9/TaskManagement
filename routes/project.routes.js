import express from "express";
import { prisma } from "../lib/prisma.js";
import { verifyToken, isAdmin } from "../middlewares/auth.middleware.js";

const router = express.Router();

// ======================================================
// ADMIN ONLY ENDPOINTS
// ======================================================

// Create admin router
const adminRouter = express.Router();
adminRouter.use(verifyToken, isAdmin);

// ======================================================
// POST /api/projects (ADMIN ONLY)
// ======================================================
adminRouter.post("/", async (req, res) => {
    try {
        const { name, description, color, startDate, endDate } = req.body;

        // Validation
        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Project name is required",
            });
        }

        // Create project
        const project = await prisma.project.create({
            data: {
                title: name,
                description,
                color,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
                createdById: req.user.id,
                members: {
                    create: {
                        userId: req.user.id,
                        role: "OWNER",
                    },
                },
            },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                members: {
                    select: {
                        id: true,
                        role: true,
                        userId: true,
                    },
                },
            },
        });

        res.status(201).json({
            success: true,
            message: "Project created successfully",
            project,
        });
    } catch (error) {
        console.error("Create project error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// ======================================================
// PUT /api/projects/:projectId (ADMIN ONLY)
// ======================================================
adminRouter.put("/:projectId", async (req, res) => {
    try {
        const { projectId } = req.params;
        const { name, description, color, startDate, endDate } = req.body;

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

        // Prepare update data
        const updateData = {};
        if (name !== undefined) updateData.title = name;
        if (description !== undefined) updateData.description = description;
        if (color !== undefined) updateData.color = color;
        if (startDate !== undefined) updateData.startDate = new Date(startDate);
        if (endDate !== undefined) updateData.endDate = new Date(endDate);

        // Update project
        const updatedProject = await prisma.project.update({
            where: { id: projectId },
            data: updateData,
            include: {
                createdBy: {
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
            message: "Project updated successfully",
            project: updatedProject,
        });
    } catch (error) {
        console.error("Update project error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// ======================================================
// PUT /api/projects/:projectId/archive (ADMIN ONLY)
// ======================================================
adminRouter.put("/:projectId/archive", async (req, res) => {
    try {
        const { projectId } = req.params;
        const { isArchived } = req.body;

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

        // Archive/unarchive project
        const updatedProject = await prisma.project.update({
            where: { id: projectId },
            data: { isArchived: isArchived || false },
            include: {
                createdBy: {
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
            message: `Project ${isArchived ? "archived" : "unarchived"} successfully`,
            project: updatedProject,
        });
    } catch (error) {
        console.error("Archive project error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// ======================================================
// DELETE /api/projects/:projectId (ADMIN ONLY)
// ======================================================
adminRouter.delete("/:projectId", async (req, res) => {
    try {
        const { projectId } = req.params;

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

        // Delete project
        await prisma.project.delete({
            where: { id: projectId },
        });

        res.status(200).json({
            success: true,
            message: "Project deleted successfully",
        });
    } catch (error) {
        console.error("Delete project error:", error);
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
// GET /api/projects (COMMON)
// ======================================================
router.get("/", verifyToken, async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;

        // Calculate pagination
        const skip = (page - 1) * limit;

        // Get total count
        const total = await prisma.project.count({
            where: { isArchived: false },
        });

        // Get projects
        const projects = await prisma.project.findMany({
            where: { isArchived: false },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
            skip,
            take: parseInt(limit),
            orderBy: { createdAt: "desc" },
        });

        res.status(200).json({
            success: true,
            data: projects,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("Get projects error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// ======================================================
// GET /api/projects/:projectId (COMMON)
// ======================================================
router.get("/:projectId", verifyToken, async (req, res) => {
    try {
        const { projectId } = req.params;

        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                members: {
                    select: {
                        id: true,
                        userId: true,
                        role: true,
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                            },
                        },
                    },
                },
            },
        });

        if (!project) {
            return res.status(404).json({
                success: false,
                message: "Project not found",
            });
        }

        res.status(200).json({
            success: true,
            project,
        });
    } catch (error) {
        console.error("Get project error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// Mount admin routes
router.use(adminRouter);

export default router;
