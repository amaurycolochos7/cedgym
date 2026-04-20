import { prisma } from '@cedgym/db';
const w = await prisma.workspace.findUnique({ where: { slug: 'ced-gym' } });
console.log(w?.id);
await prisma.$disconnect();
