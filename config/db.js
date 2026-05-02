const mongoose = require('mongoose');

const connectDB = async () => {
    mongoose.set('bufferCommands', false);

    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is not configured');
    }
    if (!/mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]+/.test(process.env.MONGO_URI)) {
        console.warn(
            'MONGO_URI does not include a database name; MongoDB will default to the "test" database.'
        );
    }
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 5000),
            socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS || 20000),
        });
        console.log('MongoDB connected successfully');
    }   catch (err) {
        console.error('Error connecting to MongoDB', err);
        process.exit(1); 
    }
};

module.exports = connectDB;
