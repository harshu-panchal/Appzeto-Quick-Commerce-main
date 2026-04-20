/**
 * Verifies that when one rider accepts an order request:
 * - the losing delivery notifications are removed
 * - the winning rider's notification is preserved
 * - the withdrawal event is emitted to the correct rooms
 * - repeated cleanup with no remaining losers is safe
 *
 * Run from backend folder:
 *   node scripts/test-delivery-broadcast-retract-flow.js
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import assert from "assert/strict";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

import Delivery from "../app/models/delivery.js";
import Notification from "../app/models/notification.js";
import {
  registerOrderSocketGetter,
  retractDeliveryBroadcastForOrder,
} from "../app/services/orderSocketEmitter.js";

function makeFakeIo(emissions) {
  return {
    to(room) {
      return {
        emit(event, payload) {
          emissions.push({ room, event, payload });
        },
      };
    },
  };
}

function uniqueOrderId(prefix) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 100000)}`;
}

async function seedDelivery(nameSuffix) {
  const rand = Math.floor(Math.random() * 1_000_000);
  return Delivery.create({
    name: `Test Rider ${nameSuffix}`,
    phone: `999${String(rand).padStart(7, "0")}`,
    isOnline: true,
    isVerified: true,
    location: {
      type: "Point",
      coordinates: [77 + Math.random() * 0.01, 28 + Math.random() * 0.01],
    },
  });
}

async function runPrimaryScenario() {
  const emissions = [];
  registerOrderSocketGetter(() => makeFakeIo(emissions));

  const orderId = uniqueOrderId("RET-TEST-");
  const winner = await seedDelivery("winner");
  const loserA = await seedDelivery("loser-a");
  const loserB = await seedDelivery("loser-b");
  const unrelated = await seedDelivery("other");

  try {
    await Notification.create([
      {
        recipient: winner._id,
        recipientModel: "Delivery",
        title: "New delivery order",
        message: `Order ${orderId} available`,
        type: "order",
        data: { orderId, preview: { pickup: "P", drop: "D" } },
      },
      {
        recipient: loserA._id,
        recipientModel: "Delivery",
        title: "New delivery order",
        message: `Order ${orderId} available`,
        type: "order",
        data: { orderId, preview: { pickup: "P", drop: "D" } },
      },
      {
        recipient: loserB._id,
        recipientModel: "Delivery",
        title: "New delivery order",
        message: `Order ${orderId} available`,
        type: "order",
        data: { orderId, preview: { pickup: "P", drop: "D" } },
      },
      {
        recipient: unrelated._id,
        recipientModel: "Delivery",
        title: "Unrelated",
        message: "Do not touch this notification",
        type: "alert",
        data: { orderId: `${orderId}-different` },
      },
    ]);

    const result = await retractDeliveryBroadcastForOrder(orderId, winner._id);
    assert.equal(result.removedCount, 2, "expected only the two losing delivery notifications to be removed");

    const remaining = await Notification.find({ "data.orderId": orderId }).lean();
    assert.equal(remaining.length, 1, "winner notification should remain");
    assert.equal(String(remaining[0].recipient), String(winner._id));

    const loserRooms = emissions.filter((e) =>
      [String(loserA._id), String(loserB._id)].includes(e.room.replace("delivery:", "")),
    );
    assert.equal(loserRooms.length, 2, "loser rooms should receive withdrawal events");
    assert.ok(
      loserRooms.every((e) => e.event === "delivery:broadcast:withdrawn"),
      "loser rooms should receive the withdrawn event",
    );

    const winnerRoomEvents = emissions.filter(
      (e) => e.room === `delivery:${String(winner._id)}`,
    );
    assert.equal(
      winnerRoomEvents.length,
      0,
      "winner room should not receive a withdrawal event",
    );

    const fallbackBefore = emissions.length;
    const secondPass = await retractDeliveryBroadcastForOrder(orderId, winner._id);
    assert.equal(secondPass.removedCount, 0, "second pass should be a no-op");
    assert.ok(
      emissions.length > fallbackBefore,
      "second pass should emit a safe fallback notification",
    );
    assert.ok(
      emissions.some((e) => e.room === "delivery:online" && e.event === "delivery:broadcast:withdrawn"),
      "fallback broadcast should go to delivery:online when no loser rows remain",
    );
  } finally {
    await Notification.deleteMany({
      $or: [
        { "data.orderId": orderId },
        { "data.orderId": `${orderId}-different` },
      ],
    });
    await Delivery.deleteMany({
      _id: { $in: [winner._id, loserA._id, loserB._id, unrelated._id] },
    });
  }
}

async function runNoSocketScenario() {
  registerOrderSocketGetter(() => null);

  const orderId = uniqueOrderId("RET-NOSOCKET-");
  const rider = await seedDelivery("nosocket");

  try {
    await Notification.create({
      recipient: rider._id,
      recipientModel: "Delivery",
      title: "New delivery order",
      message: `Order ${orderId} available`,
      type: "order",
      data: { orderId },
    });

    const result = await retractDeliveryBroadcastForOrder(orderId, rider._id);
    assert.equal(result.removedCount, 0, "single winner row should remain untouched");

    const remaining = await Notification.find({ "data.orderId": orderId }).lean();
    assert.equal(remaining.length, 1, "winner notification should remain without socket");
  } finally {
    await Notification.deleteMany({ "data.orderId": orderId });
    await Delivery.deleteMany({ _id: rider._id });
  }
}

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI is not set in .env");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log("✓ MongoDB connected");

  try {
    await runPrimaryScenario();
    await runNoSocketScenario();
    console.log("✓ Delivery broadcast retract flow passed all checks");
  } finally {
    await mongoose.disconnect();
    console.log("✓ Disconnected");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
