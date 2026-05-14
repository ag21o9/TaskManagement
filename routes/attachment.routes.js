import express from "express";
import { prisma } from "../lib/prisma.js";
import { verifyToken } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Apply auth middleware to all routes
router.use(verifyToken);

// ======================================================
// POST /api/tasks/:taskId/attachments (COMMON)
// ======================================================
router.post("/:taskId/attachments", async (req, res) => {
    try {
        const { taskId } = req.params;
        const { fileName, fileUrl, mimeType, fileSize } = req.body;

        // Validation
        if (!fileName || !fileUrl) {
            return res.status(400).json({
                success: false,
                message: "File name and file URL are required",
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

        // Create attachment
        const attachment = await prisma.attachment.create({
            data: {
                fileName,
                fileUrl,
                mimeType,
                fileSize: fileSize || 0,
                taskId,
                uploadedById: req.user.id,
            },
            include: {
                uploadedBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });

        res.status(201).json({
            success: true,
            message: "Attachment added successfully",
            attachment,
        });
    } catch (error) {
        console.error("Create attachment error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// ======================================================
// DELETE /api/attachments/:attachmentId (COMMON - Owner only)
// ======================================================
router.delete("/:attachmentId", async (req, res) => {
    try {
        const { attachmentId } = req.params;

        // Check if attachment exists
        const attachment = await prisma.attachment.findUnique({
            where: { id: attachmentId },
        });

        if (!attachment) {
            return res.status(404).json({
                success: false,
                message: "Attachment not found",
            });
        }

        // Check if user is the uploader
        if (attachment.uploadedById !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: "You can only delete your own attachments",
            });
        }

        // Delete attachment
        await prisma.attachment.delete({
            where: { id: attachmentId },
        });

        res.status(200).json({
            success: true,
            message: "Attachment deleted successfully",
        });
    } catch (error) {
        console.error("Delete attachment error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// ======================================================
// GET /api/tasks/:taskId/attachments (COMMON)
// ======================================================
router.get("/:taskId/attachments", async (req, res) => {
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

        // Get attachments
        const attachments = await prisma.attachment.findMany({
            where: { taskId },
            include: {
                uploadedBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
            orderBy: { uploadedAt: "desc" },
        });

        res.status(200).json({
            success: true,
            data: attachments,
        });
    } catch (error) {
        console.error("Get attachments error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

export default router;
