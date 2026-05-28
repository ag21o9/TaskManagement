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
    references: true,
    gst: true,
    pan: true,
    createdAt: true,
    updatedAt: true,
    network: {
        select: {
            id: true,
            name: true,
            phone: true,
            state: true,
            createdAt: true,
            updatedAt: true,
        },
    },
    createdBy: {
        select: {
            id: true,
            name: true,
            email: true,
        },
    },
};

function normalizeNetworkInput(network, networks) {
    const networkData = network ?? networks;

    if (networkData === undefined) {
        return undefined;
    }

    if (!networkData || Array.isArray(networkData) || typeof networkData !== "object") {
        return null;
    }

    const { name, phone, state } = networkData;

    if (!name || !phone || !Array.isArray(state)) {
        return null;
    }

    return { name, phone, state };
}

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
// POST /api/entities (ADMIN + USER)
// ======================================================
// Allow authenticated users to create entities. Admins keep full access.
router.post("/", verifyToken, async (req, res) => {
    try {
        const {
            name,
            state,
            phoneNumber,
            address,
            workProfile,
            network,
            networks,
            references,
            post,
            gst,
            pan,
        } = req.body;

        const networkData = normalizeNetworkInput(network, networks);

        if (networkData === null) {
            return res.status(400).json({
                success: false,
                message: "network must include name, phone, and state array",
            });
        }

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
                references,
                post,
                gst,
                pan,
                createdById: req.user.id,
                ...(networkData
                    ? {
                        network: {
                            create: networkData,
                        },
                    }
                    : {}),
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
// GET /api/entities (ADMIN: all, USER: their own)
// ======================================================
router.get("/", verifyToken, async (req, res) => {
    try {
        if (req.user.role === "ADMIN") {
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
                    network: {
                        select: {
                            id: true,
                            name: true,
                            phone: true,
                            state: true,
                            createdAt: true,
                            updatedAt: true,
                        },
                    },
                    projects: {
                        select: projectSelect,
                        orderBy: { createdAt: "desc" },
                    },
                },
            });

            return res.status(200).json({ success: true, data: entities });
        }

        // Non-admin users: only entities created by them
        const entities = await prisma.entity.findMany({
            where: { createdById: req.user.id },
            orderBy: { createdAt: "desc" },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                network: {
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                        state: true,
                        createdAt: true,
                        updatedAt: true,
                    },
                },
                projects: {
                    select: projectSelect,
                    orderBy: { createdAt: "desc" },
                },
            },
        });

        res.status(200).json({ success: true, data: entities });
    } catch (error) {
        console.error("Get entities error:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
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
// PUT /api/entities/:entityId (ADMIN + OWNER)
// ======================================================
router.put("/:entityId", verifyToken, async (req, res) => {
    try {
        const { entityId } = req.params;
        const {
            name,
            state,
            phoneNumber,
            address,
            workProfile,
            network,
            networks,
            references,
            post,
            gst,
            pan,
        } = req.body;

        const networkData = normalizeNetworkInput(network, networks);

        if (networkData === null) {
            return res.status(400).json({
                success: false,
                message: "network must include name, phone, and state array",
            });
        }

        const entity = await prisma.entity.findUnique({
            where: { id: entityId },
        });

        if (!entity) {
            return res.status(404).json({
                success: false,
                message: "Entity not found",
            });
        }

        const canUpdate = req.user.role === "ADMIN" || entity.createdById === req.user.id;
        if (!canUpdate) {
            return res.status(403).json({
                success: false,
                message: "You can only update entities you created",
            });
        }

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (state !== undefined) updateData.state = state;
        if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
        if (address !== undefined) updateData.address = address;
        if (workProfile !== undefined) updateData.workProfile = workProfile;
        if (references !== undefined) updateData.references = references;
        if (post !== undefined) updateData.post = post;
        if (gst !== undefined) updateData.gst = gst;
        if (pan !== undefined) updateData.pan = pan;

        if (networkData !== undefined) {
            updateData.network = {
                upsert: {
                    create: networkData,
                    update: networkData,
                },
            };
        }

        const updatedEntity = await prisma.entity.update({
            where: { id: entityId },
            data: updateData,
            select: entitySelect,
        });

        res.status(200).json({
            success: true,
            message: "Entity updated successfully",
            entity: updatedEntity,
        });
    } catch (error) {
        console.error("Update entity error:", error);
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
