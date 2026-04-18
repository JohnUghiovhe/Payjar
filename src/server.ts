import { app } from './app';

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  process.stdout.write(`PayFlow API listening on port ${port}\n`);
});