import type { RecipientType, UserRole } from '@cns/shared';
import { UserModel } from '../modules/auth/user.model.js';

export interface RuleRecipient {
  type: RecipientType;
  value: string;
}

export interface ResolvedRecipient {
  type: RecipientType;
  /** Address the channel adapter delivers to: an email, or a user id. */
  value: string;
  userId?: string;
  displayName?: string;
}

const dedupe = (recipients: ResolvedRecipient[]): ResolvedRecipient[] => {
  const seen = new Map<string, ResolvedRecipient>();
  for (const recipient of recipients) {
    seen.set(`${recipient.userId ?? ''}|${recipient.value.toLowerCase()}`, recipient);
  }
  return [...seen.values()];
};

/**
 * Expands a rule's recipient list into concrete addresses.
 *
 * `ROLE` fans out to every user holding that role, so a rule keeps working as
 * people join or leave the team without anyone editing it. All lookups happen
 * in two queries regardless of how many recipients a rule declares.
 */
export const resolveRecipients = async (
  recipients: readonly RuleRecipient[],
): Promise<ResolvedRecipient[]> => {
  const userIds = recipients.filter((r) => r.type === 'USER').map((r) => r.value);
  const roles = recipients.filter((r) => r.type === 'ROLE').map((r) => r.value as UserRole);

  const [usersById, usersByRole] = await Promise.all([
    userIds.length ? UserModel.find({ _id: { $in: userIds } }).lean() : Promise.resolve([]),
    roles.length ? UserModel.find({ role: { $in: roles } }).lean() : Promise.resolve([]),
  ]);

  const resolved: ResolvedRecipient[] = [];

  for (const recipient of recipients) {
    switch (recipient.type) {
      case 'EMAIL':
        resolved.push({ type: 'EMAIL', value: recipient.value });
        break;

      case 'USER': {
        const user = usersById.find((candidate) => String(candidate._id) === recipient.value);
        // A rule pointing at a deleted user is skipped rather than failing the
        // whole event; the remaining recipients still get notified.
        if (user) {
          resolved.push({
            type: 'USER',
            value: user.email,
            userId: String(user._id),
            displayName: user.name,
          });
        }
        break;
      }

      case 'ROLE': {
        for (const user of usersByRole.filter((candidate) => candidate.role === recipient.value)) {
          resolved.push({
            type: 'ROLE',
            value: user.email,
            userId: String(user._id),
            displayName: user.name,
          });
        }
        break;
      }
    }
  }

  return dedupe(resolved);
};
