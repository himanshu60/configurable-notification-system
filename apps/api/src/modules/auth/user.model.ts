import { Schema, model, type HydratedDocument, type InferSchemaType, type Model } from 'mongoose';
import { USER_ROLES, type UserDto } from '@cns/shared';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    // Never selected by default so a stray `find()` cannot leak hashes.
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, default: 'USER', required: true },
  },
  { timestamps: true, versionKey: false },
);

export type UserAttributes = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<UserAttributes>;

export const UserModel: Model<UserAttributes> = model<UserAttributes>('User', userSchema);

export const toUserDto = (user: UserDocument): UserDto => ({
  id: user.id as string,
  name: user.name,
  email: user.email,
  role: user.role,
  createdAt: (user.get('createdAt') as Date).toISOString(),
});
