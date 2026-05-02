import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { DAYS } from './data';
import { DAYS2 } from './data2';

const prisma = new PrismaClient();
const ALL_DAYS = [...DAYS, ...DAYS2];

export async function POST() {
  // Wipe existing data
  await prisma.taipeiCheckItem.deleteMany();
  await prisma.taipeiEvent.deleteMany();
  await prisma.taipeiDay.deleteMany();

  for (const day of ALL_DAYS) {
    await prisma.taipeiDay.create({
      data: {
        dayNum: day.dayNum,
        date: day.date,
        label: day.label,
        focus: day.focus,
        fakeFocus: day.fakeFocus ?? "",
        notes: day.notes,
        order: day.order,
        events: {
          create: day.events.map((ev) => ({
            time: ev.time,
            emoji: ev.emoji,
            title: ev.title,
            description: ev.description,
            location: ev.location,
            transit: ev.transit,
            tips: ev.tips,
            order: ev.order,
            realOnly: ev.realOnly ?? false,
            fakeOnly: ev.fakeOnly ?? false,
            checklist: {
              create: ev.checklist.map((c) => ({
                label: c.label,
                done: c.done,
                order: c.order,
              })),
            },
          })),
        },
      },
    });
  }

  return NextResponse.json({ ok: true, days: ALL_DAYS.length });
}
