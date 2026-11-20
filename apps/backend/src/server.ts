import { env } from "./config/env.js";
import app from "./app.js";

const PORT = env.PORT;

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Backend running at http://127.0.0.1:${PORT}`);
});