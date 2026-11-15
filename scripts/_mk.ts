import "dotenv/config";
import { db, flow, project } from "../src/lib/db";
import { issueUploadToken } from "../src/lib/tokens";
(async () => {
  const t = issueUploadToken();
  const [p] = await db.insert(project).values({ ownerEmail: "dev@local", name: "ext-test", baseUrl: "http://localhost:4400/", ...t.fields }).returning();
  const [f] = await db.insert(flow).values({ projectId: p.id, name: "예약", kind: "reserve", startUrl: "http://localhost:4400/reserve.html", stopBefore: "예약 확정" }).returning();
  console.log(t.token, f.id, p.id);
  process.exit(0);
})();
