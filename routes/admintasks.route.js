import express from "express";
import { prisma } from "../lib/prisma.js";
import { verifyToken, isAdmin } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Apply auth middleware to all routes in this file
router.use(verifyToken, isAdmin);

// ======================================================
// POST /tasks
// ======================================================
router.post("/", async (req, res) => {
  try {
    const {
      title,
      description,
      projectId,
      createdBy,
      assignedTo,
      status,
      priority,
    } = req.body;

    // Validation
    if (!title) {
      return res.status(400).json({
        success: false,
        message: "Task title is required",
      });
    }

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: "Project ID is required",
      });
    }

    if (!createdBy) {
      return res.status(400).json({
        success: false,
        message: "Created by (user ID) is required",
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

    // Check if creator exists
    const creator = await prisma.user.findUnique({
      where: { id: createdBy },
    });

    if (!creator) {
      return res.status(404).json({
        success: false,
        message: "Creator user not found",
      });
    }

    // If assigned user is provided, verify they exist
    if (assignedTo) {
      const assignedUser = await prisma.user.findUnique({
        where: { id: assignedTo },
      });

      if (!assignedUser) {
        return res.status(404).json({
          success: false,
          message: "Assigned user not found",
        });
      }
    }

    // Create task
    const task = await prisma.task.create({
      data: {
        title,
        description,
        projectId,
        createdBy,
        assignedTo,
        status: status || "TODO",
        priority: priority || "MEDIUM",
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
            name: true,
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
// PUT /tasks/:id
// ======================================================
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      assignedTo,
      status,
      priority,
      projectId,
    } = req.body;

    // Check if task exists
    const task = await prisma.task.findUnique({
      where: { id },
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    // If assignedTo is provided, verify user exists
    if (assignedTo !== undefined) {
      if (assignedTo) {
        const assignedUser = await prisma.user.findUnique({
          where: { id: assignedTo },
        });

        if (!assignedUser) {
          return res.status(404).json({
            success: false,
            message: "Assigned user not found",
          });
        }
      }
    }

    // If projectId is provided, verify project exists
    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project) {
        return res.status(404).json({
          success: false,
          message: "Project not found",
        });
      }
    }

    // Prepare update data
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (assignedTo !== undefined) updateData.assignedTo = assignedTo;
    if (status !== undefined) updateData.status = status;
    if (priority !== undefined) updateData.priority = priority;
    if (projectId !== undefined) updateData.projectId = projectId;

    // Update task
    const updatedTask = await prisma.task.update({
      where: { id },
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
            name: true,
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

export default router;
