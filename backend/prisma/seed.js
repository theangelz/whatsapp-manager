import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();
async function main() {
    console.log('Seeding database...');
    // Create default company and admin user
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const company = await prisma.company.upsert({
        where: { email: 'admin@whatsapp' },
        update: {},
        create: {
            name: 'Admin Company',
            email: 'admin@whatsapp',
            plan: 'premium',
            users: {
                create: {
                    name: 'Administrador',
                    email: 'admin@whatsapp',
                    password: hashedPassword,
                    role: 'ADMIN',
                },
            },
        },
        include: {
            users: true,
        },
    });
    console.log('Created company:', company.name);
    console.log('Created admin user: admin@whatsapp');
    console.log('Default password: admin123');
    console.log('');
    console.log('Database seeded successfully!');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
