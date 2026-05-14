import { prisma } from '../lib/prisma.js'

async function main() {
    try {

        const existingAdmin = await prisma.user.findFirst({
            where: {
                role: "ADMIN",
            },
        })

        if (existingAdmin) {
            console.log("✅ Admin already exists")
            return
        }

        const admin = await prisma.user.create({
            data: {
                name: process.env.ADMIN_NAME,
                email: process.env.ADMIN_EMAIL,
                password: process.env.ADMIN_PASSWORD,
                role: "ADMIN",
            },
        })

        console.log("Admin created successfully")
        console.log(admin)

    } catch (error) {
        console.error("❌ Error creating admin:", error)
    } finally {
        await prisma.$disconnect()
    }
}

main()