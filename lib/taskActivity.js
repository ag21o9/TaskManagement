import { prisma } from "./prisma.js";

export const recordTaskActivity = async ({
  taskId,
  userId,
  activityType,
  message,
  oldValue,
  newValue,
}) => {
  try {
    return await prisma.taskActivity.create({
      data: {
        taskId,
        userId,
        activityType,
        message,
        oldValue,
        newValue,
      },
    });
  } catch (error) {
    console.error("Record task activity error:", error);
    return null;
  }
};
