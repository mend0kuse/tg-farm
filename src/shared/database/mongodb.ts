import { APP_CONFIG } from '../../config';
import mongoose from 'mongoose';
import { BaseLogger } from '../logger';

export class MongoDatabase {
    private logger = new BaseLogger('MONGO');

    async connect() {
        try {
            const connection = await mongoose.connect(APP_CONFIG.MONGO_DB_URL);
            this.logger.log('Mongo connected');
            return connection;
        } catch (error) {
            this.logger.error(error);
        }
    }

    async close() {
        try {
            return mongoose.disconnect();
        } catch (error) {
            this.logger.error(error);
        }
    }
}

export const mongoDatabase = new MongoDatabase();
