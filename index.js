// This is the entry point that Render will use
require('dotenv').config();
const app = require('./src/index');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
