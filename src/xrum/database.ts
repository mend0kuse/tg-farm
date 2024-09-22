import mongoose from 'mongoose';

export class XrumDatabase {
    modelName = 'XrumAccount';

    createAccount(args: { index: number; tgId: number; tokens: number }) {
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
            tgId: Number,
        })
    );
}

export const xrumDatabase = new XrumDatabase();
