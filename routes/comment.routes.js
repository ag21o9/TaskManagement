import express from "express";
import { prisma } from "../lib/prisma.js";
import { recordTaskActivity } from "../lib/taskActivity.js";
import { verifyToken } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Apply auth middleware to all routes
router.use(verifyToken);

// ======================================================
// POST /api/tasks/:taskId/comments (COMMON)
// ======================================================
router.post("/:taskId/comments", async (req, res) => {
    try {
        const { taskId } = req.params;
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({
                success: false,
                message: "Comment message is required",
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

        // Create comment
        const comment = await prisma.comment.create({
            data: {
                message,
                taskId,
                userId: req.user.id,
            },
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
        });

        await recordTaskActivity({
            taskId,
            userId: req.user.id,
            activityType: "COMMENT_ADDED",
            message: `Comment added: ${message}`,
            newValue: comment.id,
        });

        res.status(201).json({
            success: true,
            message: "Comment added successfully",
            comment,
        });
    } catch (error) {
        console.error("Create comment error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// ======================================================
// PUT /api/comments/:commentId (COMMON - Owner only)
// ======================================================
router.put("/:commentId", async (req, res) => {
    try {
        const { commentId } = req.params;
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({
                success: false,
                message: "Comment message is required",
            });
        }

        // Check if comment exists
        const comment = await prisma.comment.findUnique({
            where: { id: commentId },
        });

        if (!comment) {
            return res.status(404).json({
                success: false,
                message: "Comment not found",
            });
        }

        // Check if user is the comment author
        if (comment.userId !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: "You can only edit your own comments",
            });
        }

        // Update comment
        const updatedComment = await prisma.comment.update({
            where: { id: commentId },
            data: { message },
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
        });

        res.status(200).json({
            success: true,
            message: "Comment updated successfully",
            comment: updatedComment,
        });
    } catch (error) {
        console.error("Update comment error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// ======================================================
// DELETE /api/comments/:commentId (COMMON - Owner only)
// ======================================================
router.delete("/:commentId", async (req, res) => {
    try {
        const { commentId } = req.params;


        // Check if comment exists
        const comment = await prisma.comment.findUnique({
            where: { id: commentId },
        });

        if (!comment) {
            return res.status(404).json({
                success: false,
                message: "Comment not found",
            });
        }

        // Check if user is the comment author
        if (comment.userId !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: "You can only delete your own comments",
            });
        }

        // Delete comment
        await prisma.comment.delete({
            where: { id: commentId },
        });

        res.status(200).json({
            success: true,
            message: "Comment deleted successfully",
        });
    } catch (error) {
        console.error("Delete comment error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// ======================================================
// GET /api/tasks/:taskId/comments (COMMON)
// ======================================================
router.get("/:taskId/comments", async (req, res) => {
    try {
        const { taskId } = req.params;
        const { page = 1, limit = 20 } = req.query;

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

        // Calculate pagination
        const skip = (page - 1) * limit;

        // Get total count
        const total = await prisma.comment.count({
            where: { taskId },
        });

        // Get comments
        const comments = await prisma.comment.findMany({
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
            skip,
            take: parseInt(limit),
            orderBy: { createdAt: "desc" },
        });

        res.status(200).json({
            success: true,
            data: comments,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("Get comments error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

export default router;
