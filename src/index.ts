// worker.js (or .ts)
import { lockSeatTemporarily } from "./utils/lockSeats.js";
import { prisma } from "./utils/prisma.js"; // or './prisma.ts'
import { redis } from "./utils/redis.js";
import { stripe } from "./utils/stripe.js";

async function startWorker() {
  await redis.connect();

  console.log("🚀 Worker started. Listening to queue...");

  while (true) {
    // Wait for new booking job (BRPOP blocks until something arrives)
    const result = await redis.brPop("bookings", 0);
    const rawData = result?.element;

    if (!rawData) continue;

    const data = JSON.parse(rawData);
    const { bookingId, showtimeId, userId, seatsToBook } = data;

    if (!bookingId || !showtimeId || !userId || !seatsToBook) {
      console.error("❌ Invalid data received:", data);
      continue;
    }
    try {
      try {
        const locks = await lockSeatTemporarily({
          showtimeId,
          seatsToBook,
          userId,
        });
      } catch (err) {
        console.error("❌ Error locking seats:", err);
        continue;
      }

      const metaData = {
        seatsToBook,
        userId,
        bookingId,
        showtimeId,
      };

      const metaDataString = JSON.stringify(metaData);

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "inr",
              product_data: {
                name: "Movie Seat Reservation",
              },
              unit_amount: 1500000, // $15.00 => 1500
            },
            quantity: 1,
          },
        ],
        metadata: {
          metaDataString,
        },
        success_url: `${process.env.CLIENT_URL}/success?jobId=${bookingId}`,
        cancel_url: `${process.env.CLIENT_URL}/cancel`,
      });

      console.log(session, "session");

      if (!session) {
        console.error("❌ Error creating Stripe session");
        continue;
      }

      await prisma.bookingJob.update({
        where: { id: bookingId },
        data: {
          status: "AWAITING_PAYMENT",
          paymentSessionId: session.id,
          paymentUrl: session.url,
        },
      });
    } catch (err) {
      console.error("❌ Error processing job:", err);
    }
  }
}

startWorker();
