import { prisma } from "@/lib/db";

const OPEN_STATUSES = ["PENDING", "IN_PROGRESS", "BLOCKED"] as const;

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
    orderBy: [{ dueAt: "asc" }, { priority: "desc" }],
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
