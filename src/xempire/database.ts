import mongoose from 'mongoose';

export class XEmpireDatabase {
    modelName = 'EmpireAccount';

    createAccount(args: { level: number; refCode: string; index: number }) {
        return this.accountModel.create(args);
    }

    findByIndex(index: number) {
        return this.accountModel.findOne({ index });
    }

    updateLevelByIndex(index: number, level: number) {
        return this.accountModel.updateOne({ index }, { $set: { level } });
    }

    findAll() {
        return this.accountModel.find();
    }

    private accountModel = mongoose.model(
        this.modelName,
        new mongoose.Schema({
            index: Number,
            refCode: String,
            level: Number,
        })
    );
}

export const xEmpireDatabase = new XEmpireDatabase();
