import { prisma } from "@/lib/db";

const OPEN_STATUSES = ["PENDING", "IN_PROGRESS", "BLOCKED"] as const;

// priority é String no banco (LOW | NORMAL | HIGH | URGENT). Ordenar por
// "desc" no SQL classificaria alfabeticamente (URGENT, NORMAL, LOW, HIGH),
// jogando HIGH para o fim. Ranqueamos numericamente na aplicação.
const PRIORITY_RANK: Record<string, number> = {
  URGENT: 4,
  HIGH: 3,
  NORMAL: 2,
  LOW: 1,
};

export async function getCapacityByDepartment(firmId: string) {
  const tasks = await prisma.task.findMany({
    where: {
      firmId,
      status: { in: [...OPEN_STATUSES] },
    },
    include: {
      assignee: { select: { id: true, name: true } },
      client: { select: { id: true, tradeName: true, legalName: true } },
    },
  });

  // Ordena por prioridade (maior primeiro) e, dentro da mesma prioridade,
  // pelo vencimento mais próximo.
  tasks.sort((a, b) => {
    const pr = (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0);
    if (pr !== 0) return pr;
    const aDue = a.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const bDue = b.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    return aDue - bDue;
  });

  const now = Date.now();
  const byDept = new Map<
    string,
    {
      department: string;
      open: number;
      overdue: number;
      unassigned: number;
      tasks: typeof tasks;
    }
  >();

  for (const t of tasks) {
    const dept = t.department || "FISCAL";
    let row = byDept.get(dept);
    if (!row) {
      row = { department: dept, open: 0, overdue: 0, unassigned: 0, tasks: [] };
      byDept.set(dept, row);
    }
    row.open += 1;
    if (!t.assigneeId) row.unassigned += 1;
    if (t.dueAt && t.dueAt.getTime() < now) row.overdue += 1;
    row.tasks.push(t);
  }

  return Array.from(byDept.values()).sort((a, b) =>
    a.department.localeCompare(b.department),
  );
}
