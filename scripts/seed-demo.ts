// Adds sample sitters for trying Phone Tree in test mode. Run: npm run seed:demo
import { getDb, closeDb, schema } from "../src/db";
import { getHousehold } from "../src/lib/engine/context";
import { ensureParents } from "../src/lib/auth";

const EVE = ["6:evening", "6:late", "5:evening", "5:late"];
const WEEKDAY_AFTERNOONS = [1, 2, 3, 4, 5].map((d) => `${d}:afternoon`);

async function main() {
  const db = getDb();
  await getHousehold(db);
  await ensureParents();
  const sitters = [
    { name: "Maya R.", phone: "+19255550142", rateCents: 2600, tier: 1, availability: [...EVE, ...WEEKDAY_AFTERNOONS] },
    { name: "Jess T.", phone: "+19255550187", rateCents: 2400, tier: 1, availability: [...EVE] },
    { name: "Priya K.", phone: "+19255550119", rateCents: 2700, tier: 1, availability: ["6:morning", "6:afternoon", "7:morning"] },
    { name: "Elena V.", phone: "+19255550163", rateCents: 2800, tier: 2, availability: [...EVE] },
    { name: "Hannah B.", phone: "+19255550108", rateCents: 2200, tier: 2, availability: [...WEEKDAY_AFTERNOONS] },
    { name: "Rosa M.", phone: "+19255550174", rateCents: 2500, tier: 3, availability: [...EVE, ...WEEKDAY_AFTERNOONS] },
    { name: "Tara L.", phone: "+19255550131", rateCents: 2300, tier: 3, availability: [...EVE] },
  ];
  for (const s of sitters) {
    await db.insert(schema.providers).values({ ...s, joined: true, joinedAt: new Date() }).onConflictDoNothing();
  }
  console.log(`Added ${sitters.length} sample sitters`);
  await closeDb();
}

main();
