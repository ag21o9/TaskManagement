import express from "express";
import { prisma } from "../lib/prisma.js";
import { verifyToken, isAdmin } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Apply auth middleware to all routes (require authentication)
router.use(verifyToken);

// ======================================================
// GET /api/dashboard/stats (ADMIN and AUTHENTICATED USERS)
// - Admins receive global stats
// - Regular users receive stats scoped to their assigned tasks/projects
// ======================================================
router.get("/stats", async (req, res) => {
  try {
    const userId = req.user?.id;
    const isUserAdmin = req.user?.role === "ADMIN";

    if (isUserAdmin) {
      // Admin: return global stats
      const totalUsers = await prisma.user.count();
      const activeUsers = await prisma.user.count({ where: { isActive: true } });
      const activeProjects = await prisma.project.count({ where: { isArchived: false } });
      const totalProjects = await prisma.project.count();
      const completedTasks = await prisma.task.count({ where: { status: "COMPLETED" } });
      const totalTasks = await prisma.task.count();
      const overdueTasks = await prisma.task.count({
        where: {
          status: { not: "COMPLETED" },
          dueDate: { lt: new Date() },
          isArchived: false,
        },
      });
      const inProgressTasks = await prisma.task.count({ where: { status: "IN_PROGRESS" } });

      return res.status(200).json({
        success: true,
        stats: {
          users: { total: totalUsers, active: activeUsers, inactive: totalUsers - activeUsers },
          projects: { total: totalProjects, active: activeProjects, archived: totalProjects - activeProjects },
          tasks: { total: totalTasks, completed: completedTasks, inProgress: inProgressTasks, overdue: overdueTasks, pending: totalTasks - completedTasks - inProgressTasks },
        },
      });
    }

    // Regular user: stats scoped to their assignments
    // Projects the user is a member of (active)
    const userActiveProjects = await prisma.projectMember.count({
      where: { userId, project: { isArchived: false } },
    });

    // Tasks assigned to the user
    const totalAssigned = await prisma.task.count({ where: { assignedToId: userId, isArchived: false } });
    const completedAssigned = await prisma.task.count({ where: { assignedToId: userId, status: "COMPLETED", isArchived: false } });
    const inProgressAssigned = await prisma.task.count({ where: { assignedToId: userId, status: "IN_PROGRESS", isArchived: false } });
    const pendingAssigned = await prisma.task.count({ where: { assignedToId: userId, status: "TODO", isArchived: false } });
    const overdueAssigned = await prisma.task.count({ where: { assignedToId: userId, status: { not: "COMPLETED" }, dueDate: { lt: new Date() }, isArchived: false } });

    const productivity = totalAssigned > 0 ? Math.round((completedAssigned / totalAssigned) * 100) : 0;

    return res.status(200).json({
      success: true,
      stats: {
        projects: { total: userActiveProjects },
        tasks: { total: totalAssigned, completed: completedAssigned, inProgress: inProgressAssigned, pending: pendingAssigned, overdue: overdueAssigned },
        teamProductivity: productivity,
      },
    });
  } catch (error) {
    console.error("Get dashboard stats error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ======================================================
// GET /api/projects/:projectId/analytics (ADMIN ONLY)
// ======================================================
router.get("/projects/:projectId/analytics", async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user?.id;
    const isUserAdmin = req.user?.role === "ADMIN";

    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }

    // If not admin, ensure user is a project member
    if (!isUserAdmin) {
      const membership = await prisma.projectMember.findFirst({
        where: { projectId, userId },
      });
      if (!membership) {
        return res.status(403).json({ success: false, message: "Access denied. Must be project member or admin" });
      }
    }

    // Get project tasks
    const totalTasks = await prisma.task.count({ where: { projectId } });
    const completedTasks = await prisma.task.count({ where: { projectId, status: "COMPLETED" } });
    const inProgressTasks = await prisma.task.count({ where: { projectId, status: "IN_PROGRESS" } });
    const todoTasks = await prisma.task.count({ where: { projectId, status: "TODO" } });
    const overdueTasks = await prisma.task.count({
      where: { projectId, status: { not: "COMPLETED" }, dueDate: { lt: new Date() }, isArchived: false },
    });

    // Get team members
    const teamMembers = await prisma.projectMember.count({ where: { projectId } });

    // Calculate completion percentage
    const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Get project timeline
    const projectStartDate = project.startDate;
    const projectEndDate = project.endDate;
    const today = new Date();

    let timelinePercentage = 0;
    if (projectStartDate && projectEndDate) {
      const totalDays = (projectEndDate - projectStartDate) / (1000 * 60 * 60 * 24);
      const elapsedDays = (today - projectStartDate) / (1000 * 60 * 60 * 24);
      timelinePercentage = Math.min(100, Math.round((elapsedDays / totalDays) * 100));
    }

    res.status(200).json({
      success: true,
      analytics: {
        project: { id: project.id, title: project.title, description: project.description },
        tasks: { total: totalTasks, completed: completedTasks, inProgress: inProgressTasks, todo: todoTasks, overdue: overdueTasks, completionPercentage },
        team: { members: teamMembers },
        timeline: { startDate: projectStartDate, endDate: projectEndDate, timelinePercentage },
      },
    });
  } catch (error) {
    console.error("Get project analytics error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ======================================================
// GET /api/users/:id/productivity (ADMIN ONLY)
// ======================================================
router.get("/users/:userId/productivity", isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Get user tasks statistics
    const totalAssignedTasks = await prisma.task.count({
      where: { assignedTo: userId },
    });

    const completedTasks = await prisma.task.count({
      where: { assignedTo: userId, status: "COMPLETED" },
    });

    const inProgressTasks = await prisma.task.count({
      where: { assignedTo: userId, status: "IN_PROGRESS" },
    });

    const overdueTasks = await prisma.task.count({
      where: {
        assignedTo: userId,
        status: { not: "COMPLETED" },
        dueDate: { lt: new Date() },
        isArchived: false,
      },
    });

    // Get user comments count
    const commentsCount = await prisma.comment.count({
      where: { authorId: userId },
    });

    // Get projects user is member of
    const projectsCount = await prisma.projectMember.count({
      where: { userId },
    });

    // Calculate productivity score
    const productivityScore =
      totalAssignedTasks > 0
        ? Math.round((completedTasks / totalAssignedTasks) * 100)
        : 0;

    // Get average time to complete (simplified)
    const completedTasksData = await prisma.task.findMany({
      where: {
        assignedTo: userId,
        status: "COMPLETED",
        completedAt: { not: null },
      },
      select: {
        createdAt: true,
        completedAt: true,
      },
      take: 10,
    });

    let averageCompletionTime = 0;
    if (completedTasksData.length > 0) {
      const totalTime = completedTasksData.reduce((acc, task) => {
        return acc + (task.completedAt - task.createdAt);
      }, 0);
      averageCompletionTime = Math.round(
        totalTime / completedTasksData.length / (1000 * 60 * 60 * 24)
      );
    }

    res.status(200).json({
      success: true,
      productivity: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        tasks: {
          total: totalAssignedTasks,
          completed: completedTasks,
          inProgress: inProgressTasks,
          overdue: overdueTasks,
          productivityScore,
        },
        engagement: {
          commentsCount,
          projectsCount,
        },
        metrics: {
          averageCompletionTimeDays: averageCompletionTime,
        },
      },
    });
  } catch (error) {
    console.error("Get user productivity error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

export default router;
