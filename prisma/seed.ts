import { PrismaClient, Role, TaskStatus, TaskPriority, ProjectStatus } from '@prisma/client';

import { hashPassword } from '../src/lib/credentials';

const prisma = new PrismaClient();

/**
 * Password de los usuarios de prueba.
 *
 * SOLO sirve para desarrollo: el seed limpia la base entera, asi que nunca se
 * ejecuta contra produccion. Se puede sobreescribir con SEED_USER_PASSWORD.
 */
const SEED_PASSWORD = process.env.SEED_USER_PASSWORD ?? 'Admin1234!';

async function main(): Promise<void> {
  const passwordHash = await hashPassword(SEED_PASSWORD);

  // Limpiar tablas en orden seguro para relaciones
  await prisma.documentChunk.deleteMany();
  await prisma.document.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  // Usuarios de prueba
  const admin = await prisma.user.create({
    data: {
      clerkId: 'user_test_admin_001',
      email: 'admin@aiprojecthub.dev',
      name: 'Juan Admin',
      role: Role.ADMIN,
      passwordHash,
    },
  });

  const maria = await prisma.user.create({
    data: {
      clerkId: 'user_test_maria_002',
      email: 'maria@aiprojecthub.dev',
      name: 'María López',
      role: Role.MEMBER,
      passwordHash,
    },
  });

  const carlos = await prisma.user.create({
    data: {
      clerkId: 'user_test_carlos_003',
      email: 'carlos@aiprojecthub.dev',
      name: 'Carlos Ruiz',
      role: Role.MEMBER,
      passwordHash,
    },
  });

  // Proyectos
  const chatbotProject = await prisma.project.create({
    data: {
      name: 'Chatbot RAG interno',
      description: 'Asistente que responde usando documentos de la empresa.',
      status: ProjectStatus.ACTIVE,
      ownerId: admin.id,
    },
  });

  const analyticsProject = await prisma.project.create({
    data: {
      name: 'Analítica de ventas',
      description: 'Dashboard y predicciones con IA para ventas.',
      status: ProjectStatus.ACTIVE,
      ownerId: maria.id,
    },
  });

  // Tareas
  await prisma.task.create({
    data: {
      title: 'Configurar esquema de Prisma',
      description: 'Revisar modelos y relaciones.',
      status: TaskStatus.COMPLETED,
      priority: TaskPriority.HIGH,
      projectId: chatbotProject.id,
      assigneeId: admin.id,
    },
  });

  await prisma.task.create({
    data: {
      title: 'Implementar pipeline de chunks',
      description: 'Dividir documentos y preparar para embeddings.',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      projectId: chatbotProject.id,
      assigneeId: maria.id,
    },
  });

  await prisma.task.create({
    data: {
      title: 'Crear endpoint de búsqueda',
      description: 'Endpoint para consultar documentos por similitud.',
      status: TaskStatus.PENDING,
      priority: TaskPriority.MEDIUM,
      projectId: chatbotProject.id,
      assigneeId: carlos.id,
    },
  });

  await prisma.task.create({
    data: {
      title: 'Entrenar modelo de forecasting',
      description: 'Probar modelos baseline de series de tiempo.',
      status: TaskStatus.PENDING,
      priority: TaskPriority.LOW,
      projectId: analyticsProject.id,
      assigneeId: maria.id,
    },
  });

  // Documentos
  const doc1 = await prisma.document.create({
    data: {
      title: 'Guía de onboarding',
      fileUrl: 'https://example.com/onboarding.pdf',
      content:
        'Bienvenido al equipo. Comienza con la configuración de tu cuenta, revisa el código base y conoce los flujos de PR.',
      projectId: chatbotProject.id,
    },
  });

  const doc2 = await prisma.document.create({
    data: {
      title: 'Arquitectura del Chatbot',
      fileUrl: 'https://example.com/arquitectura.md',
      content:
        'El chatbot usa RAG: recuperación de chunks relevantes y generación con LLM. Se indexan documentos con embeddings y se filtra por proyecto.',
      projectId: chatbotProject.id,
    },
  });

  const doc3 = await prisma.document.create({
    data: {
      title: 'Plan de analítica',
      fileUrl: 'https://example.com/plan-analitica.pdf',
      content:
        'Medir KPIs, crear dashboard en Next.js y exponer insights con modelos predictivos.',
      projectId: analyticsProject.id,
    },
  });

  // Chunks asociados
  await prisma.documentChunk.createMany({
    data: [
      { documentId: doc1.id, content: 'Bienvenido al equipo.', chunkIndex: 0 },
      { documentId: doc1.id, content: 'Comienza con la configuración de tu cuenta.', chunkIndex: 1 },
      { documentId: doc2.id, content: 'El chatbot usa RAG.', chunkIndex: 0 },
      { documentId: doc2.id, content: 'Se indexan documentos con embeddings.', chunkIndex: 1 },
      { documentId: doc3.id, content: 'Medir KPIs y crear dashboard.', chunkIndex: 0 },
    ],
  });

  console.log('✅ Seed ejecutado correctamente');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
