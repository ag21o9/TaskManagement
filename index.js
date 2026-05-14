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

import adminAuthRoutes from "./routes/adminauth.route.js"
import adminUsersRoutes from "./routes/adminusers.route.js"
import adminProjectsRoutes from "./routes/adminprojects.route.js"
import adminTasksRoutes from "./routes/admintasks.route.js"

// Admin Routes
app.use("/api/auth", adminAuthRoutes)
app.use("/api/admin/users", adminUsersRoutes)
app.use("/api/admin/projects", adminProjectsRoutes)
app.use("/api/admin/tasks", adminTasksRoutes)



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