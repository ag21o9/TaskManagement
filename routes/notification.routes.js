import express from "express";
import { prisma } from "../lib/prisma.js";
import { verifyToken } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Apply auth middleware to all routes
router.use(verifyToken);

// ======================================================
// GET /api/notifications (COMMON)
// ======================================================
router.get("/", async (req, res) => {
    try {
        const { page = 1, limit = 20, read } = req.query;

        // Build where clause
        const where = { userId: req.user.id };
        if (read !== undefined) where.isRead = read === "true";

        // Calculate pagination
        const skip = (page - 1) * limit;

        // Get total count
        const total = await prisma.notification.count({ where });

        // Get notifications
        const notifications = await prisma.notification.findMany({
            where,
            skip,
            take: parseInt(limit),
            orderBy: { createdAt: "desc" },
        });

        res.status(200).json({
            success: true,
            data: notifications,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("Get notifications error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// ======================================================
// PUT /api/notifications/:id/read (COMMON)
// ======================================================
router.put("/:id/read", async (req, res) => {
    try {
        const { id } = req.params;

        // Check if notification exists and belongs to user
        const notification = await prisma.notification.findUnique({
            where: { id },
        });

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: "Notification not found",
            });
        }

        if (notification.userId !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: "You can only mark your own notifications as read",
            });
        }

        // Mark as read
        const updatedNotification = await prisma.notification.update({
            where: { id },
            data: { isRead: true },
        });

        res.status(200).json({
            success: true,
            message: "Notification marked as read",
            notification: updatedNotification,
        });
    } catch (error) {
        console.error("Mark notification read error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// ======================================================
// PUT /api/notifications/read-all (COMMON)
// ======================================================
router.put("/read-all/bulk", async (req, res) => {
    try {
        // Mark all unread notifications as read for the current user
        const result = await prisma.notification.updateMany({
            where: {
                userId: req.user.id,
                isRead: false,
            },
            data: { isRead: true },
        });

        res.status(200).json({
            success: true,
            message: `${result.count} notifications marked as read`,
        });
    } catch (error) {
        console.error("Mark all notifications read error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

export default router;
