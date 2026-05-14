import express from "express";
import { prisma } from "../lib/prisma.js";
import { verifyToken, isAdmin } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Apply auth middleware to all routes in this file
router.use(verifyToken, isAdmin);

router.post("/", async (req, res) => {
    try {

        const {
            name,
            description,
            color,
            startDate,
            endDate
        } = req.body;

        // ==================================================
        // VALIDATION
        // ==================================================

        if (!name || name.trim() === "") {
            return res.status(400).json({
                success: false,
                message: "Project name is required",
            });
        }

        // ==================================================
        // CHECK DUPLICATE PROJECT
        // ==================================================

        const existingProject = await prisma.project.findFirst({
            where: {
                title: name.trim(),
                createdById: req.user.id,
            },
        });

        if (existingProject) {
            return res.status(400).json({
                success: false,
                message: "Project with this name already exists",
            });
        }

        // ==================================================
        // CREATE PROJECT
        // ==================================================

        const project = await prisma.project.create({
            data: {

                title: name.trim(),

                description,

                color,

                startDate: startDate
                    ? new Date(startDate)
                    : undefined,

                endDate: endDate
                    ? new Date(endDate)
                    : undefined,

                createdById: req.user.id,

                // ==========================================
                // AUTO ADD CREATOR AS OWNER
                // ==========================================

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
                    include: {
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

        // ==================================================
        // RESPONSE
        // ==================================================

        return res.status(201).json({
            success: true,
            message: "Project created successfully",
            project,
        });

    } catch (error) {

        console.error("Create project error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// ======================================================
// GET /projects
// ======================================================
router.get("/", async (req, res) => {
    try {
        const { page = 1, limit = 10, userId } = req.query;

        // Build where clause for filtering
        const where = {};
        if (userId) where.createdById = userId;

        // Calculate pagination
        const skip = (page - 1) * limit;

        // Get total count
        const total = await prisma.project.count({ where });

        // Get projects
        const projects = await prisma.project.findMany({
            where,
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

export default router;
