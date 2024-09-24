import mongoose from 'mongoose';

export class CatsDatabase {
    modelName = 'CatsAccount';

    createAccount(args: { index: number; refCode: string; tokens: number }) {
        return this.accountModel.create(args);
    }

    findByIndex(index: number) {
        return this.accountModel.findOne({ index });
    }

    updateTokensByIndex(index: number, tokens: number) {
        return this.accountModel.updateOne({ index }, { $set: { tokens } });
    }

    findAll() {
        return this.accountModel.find({});
    }

    private accountModel = mongoose.model(
        this.modelName,
        new mongoose.Schema({
            index: Number,
            tokens: Number,
            refCode: String,
        })
    );
}

export const catsDatabase = new CatsDatabase();
