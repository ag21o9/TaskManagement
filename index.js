import express from "express"
import cors from "cors"
import morgan from "morgan"

import dotenv from "dotenv"

dotenv.config()

const app = express()


const PORT = process.env.PORT || 5000

app.use(cors())

app.use(express.json())
app.use(express.urlencoded({ extended: true }))


app.use(morgan("dev"))



app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Task Management API Running Successfully 🚀",
    })
})

// ======================================================
// API ROUTES
// ======================================================

import authRoutes from "./routes/auth.routes.js"
import userRoutes from "./routes/user.routes.js"
import projectRoutes from "./routes/project.routes.js"
import taskRoutes from "./routes/task.routes.js"
import commentRoutes from "./routes/comment.routes.js"
import attachmentRoutes from "./routes/attachment.routes.js"
import notificationRoutes from "./routes/notification.routes.js"
import dashboardRoutes from "./routes/dashboard.routes.js"

// Auth Routes (Public + Authenticated)
app.use("/api/auth", authRoutes)

// User Management Routes (Admin only)
app.use("/api/users", userRoutes)

// Project Routes (Admin + User)
app.use("/api/projects", projectRoutes)

// Task Routes (Admin + User)
app.use("/api/tasks", taskRoutes)

// Comment Routes (User + Admin)
app.use("/api/comments", commentRoutes)

// Attachment Routes (User + Admin)
app.use("/api/attachments", attachmentRoutes)

// Notification Routes (User + Admin)
app.use("/api/notifications", notificationRoutes)

// Dashboard Routes (Admin only)
app.use("/api/dashboard", dashboardRoutes)



app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Route Not Found",
    })
})


app.use((err, req, res, next) => {
    console.error(err)

    res.status(err.status || 500).json({
        success: false,
        message: err.message || "Internal Server Error",
    })
})


app.listen(PORT, () => {
    console.log('Server Running on PORT', PORT)
})