import express from "express";
import routes from "./routes";
import { requestId } from "./middleware/request-id";
import { errorHandler } from "./middleware/error-handler";

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(requestId);
app.use("/api/v1", routes);
app.use(errorHandler);

export default app;
