import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

const app = express();
//for security purposes, we are disabling the content security policy as it can interfere with some of the features of our application. In a production environment, you should configure the content security policy according to your application's needs.
app.use(
    helmet({
        contentSecurityPolicy: false, 
    })
);
// Middleware
app.use(express.json());
// Enable CORS for all routes
app.use(cors());


app.listen(3000, () => {
    console.log('Server is running on port 3000');
});