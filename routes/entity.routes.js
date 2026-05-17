import express from "express";
import { prisma } from "../lib/prisma.js";
import { verifyToken, isAdmin } from "../middlewares/auth.middleware.js";

const router = express.Router();

const entitySelect = {
    id: true,
    name: true,
    state: true,
    phoneNumber: true,
    address: true,
    workProfile: true,
    network1: true,
    network2: true,
    network3: true,
    gst: true,
    pan: true,
    createdAt: true,
    updatedAt: true,
    createdBy: {
        select: {
            id: true,
            name: true,
            email: true,
        },
    },
};

const projectSelect = {
    id: true,
    title: true,
    description: true,
    color: true,
    startDate: true,
    endDate: true,
    isArchived: true,
    createdAt: true,
    updatedAt: true,
};

// ======================================================
// POST /api/entities (ADMIN ONLY)
// ======================================================
router.post("/", verifyToken, isAdmin, async (req, res) => {
    try {
        const {
            name,
            state,
            phoneNumber,
            address,
            workProfile,
            network1,
            network2,
            network3,
            gst,
            pan,
        } = req.body;

        if (!name || !state || !phoneNumber || !address || !workProfile) {
            return res.status(400).json({
                success: false,
                message: "Name, state, phone number, address, and work profile are required",
            });
        }

        const entity = await prisma.entity.create({
            data: {
                name,
                state,
                phoneNumber,
                address,
                workProfile,
                network1,
                network2,
                network3,
                gst,
                pan,
                createdById: req.user.id,
            },
            select: entitySelect,
        });

        res.status(201).json({
            success: true,
            message: "Entity created successfully",
            entity,
        });
    } catch (error) {
        console.error("Create entity error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// ======================================================
// GET /api/entities (ADMIN ONLY)
// ======================================================
router.get("/", verifyToken, isAdmin, async (req, res) => {
    try {
        const entities = await prisma.entity.findMany({
            orderBy: { createdAt: "desc" },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                projects: {
                    select: projectSelect,
                    orderBy: { createdAt: "desc" },
                },
            },
        });

        res.status(200).json({
            success: true,
            data: entities,
        });
    } catch (error) {
        console.error("Get entities error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// ======================================================
// GET /api/entities/:entityId (PUBLIC)
// ======================================================
router.get("/:entityId", async (req, res) => {
    try {
        const { entityId } = req.params;

        const entity = await prisma.entity.findUnique({
            where: { id: entityId },
            select: {
                ...entitySelect,
                projects: {
                    select: projectSelect,
                    orderBy: { createdAt: "desc" },
                },
            },
        });

        if (!entity) {
            return res.status(404).json({
                success: false,
                message: "Entity not found",
            });
        }

        res.status(200).json({
            success: true,
            entity,
        });
    } catch (error) {
        console.error("Get entity error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// ======================================================
// POST /api/entities/:entityId/projects (ADMIN ONLY)
// Add one or more existing projects to an entity
// ======================================================
router.post("/:entityId/projects", verifyToken, isAdmin, async (req, res) => {
    try {
        const { entityId } = req.params;
        const { projectId, projectIds } = req.body;

        const entity = await prisma.entity.findUnique({
            where: { id: entityId },
        });

        if (!entity) {
            return res.status(404).json({
                success: false,
                message: "Entity not found",
            });
        }

        const ids = Array.isArray(projectIds)
            ? projectIds
            : projectId
                ? [projectId]
                : [];

        if (ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: "projectId or projectIds is required",
            });
        }

        const projects = await prisma.project.findMany({
            where: { id: { in: ids } },
        });

        if (projects.length !== ids.length) {
            return res.status(404).json({
                success: false,
                message: "One or more projects not found",
            });
        }

        await prisma.project.updateMany({
            where: { id: { in: ids } },
            data: { entityId },
        });

        const updatedEntity = await prisma.entity.findUnique({
            where: { id: entityId },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                projects: {
                    select: projectSelect,
                    orderBy: { createdAt: "desc" },
                },
            },
        });

        res.status(200).json({
            success: true,
            message: "Projects added to entity successfully",
            entity: updatedEntity,
        });
    } catch (error) {
        console.error("Add projects to entity error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

export default router;
