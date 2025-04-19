import { prisma } from "./prisma";
import { redis } from "./redis";

export const lockSeatTemporarily = async ({
  showtimeId,
  seatsToBook,
  userId,
}: {
  showtimeId: string;
  seatsToBook: Array<number>;
  userId: string;
}) => {
  try {
    const locks: string[] = [];

    for (const seat of seatsToBook) {
      const key = `lock:seat:${showtimeId}:${seat}`;
      const success = await redis.set(key, userId, {
        NX: true,
        EX: 300,
      });

      if (!success) {
        for (const locked of locks) {
          await redis.del(locked);
        }

        throw new Error(`Seat ${seat} is already locked by another user`);
      }

      locks.push(key);
    }

    const bookedSeats = await prisma.seat.findMany({
      where: {
        showtimeId,
        number: { in: seatsToBook },
        isBooked: true,
      },
    });

    if (bookedSeats.length > 0) {
      for (const locked of locks) {
        await redis.del(locked);
      }
      throw new Error(`Some seats are already booked`);
    }

    return locks;
  } catch (err) {
    throw err;
  }
};
