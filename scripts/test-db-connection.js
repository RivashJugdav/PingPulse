require('dotenv').config();
const mongoose = require('mongoose');

async function testConnection() {
    try {
        console.log('Attempting to connect to MongoDB...');
        console.log('URI:', process.env.MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@')); // Hide password in logs
        
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000
        });

        console.log('Successfully connected to MongoDB!');
        console.log('Database name:', mongoose.connection.db.databaseName);
        
        // Test write permission by creating and immediately removing a test document
        const testCollection = mongoose.connection.db.collection('connection_test');
        await testCollection.insertOne({ test: true, timestamp: new Date() });
        await testCollection.deleteOne({ test: true });
        
        console.log('Successfully tested write permissions');
        
    } catch (error) {
        console.error('Error connecting to MongoDB:', error.message);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

testConnection();
