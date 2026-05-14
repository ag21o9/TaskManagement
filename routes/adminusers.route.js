import express from "express";
import { prisma } from "../lib/prisma.js";
import { verifyToken, isAdmin } from "../middlewares/auth.middleware.js";
// import bcrypt from "bcrypt";

const router = express.Router();

// Apply auth middleware to all routes in this file
router.use(verifyToken, isAdmin);


router.post("/create", async (req, res) => {
    try {
        const { name, email, password, role, phone, avatar } = req.body;

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
        const hashedPassword = password

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
        });

        res.status(201).json({
            success: true,
            message: "User created successfully",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                phone: user.phone,
                avatar: user.avatar,
                isActive: user.isActive,
                createdAt: user.createdAt,
            },
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
// GET /users
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
// PUT /users/:id
// ======================================================
router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, role, phone, avatar, isActive } = req.body;

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
        if (role !== undefined) updateData.role = role;
        if (phone !== undefined) updateData.phone = phone;
        if (avatar !== undefined) updateData.avatar = avatar;
        if (isActive !== undefined) updateData.isActive = isActive;

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

export default router;
