/* Blood-group compatibility rules for red-cell / whole-blood donation. */
export const RARE_GROUPS = ['A-', 'B-', 'AB-', 'O-', 'Bombay (hh)'];

/** Donor groups that can donate to a recipient of `recipient` group. */
export function compatibleDonors(recipient: string): string[] {
  switch (recipient) {
    case 'O-': return ['O-'];
    case 'O+': return ['O-', 'O+'];
    case 'A-': return ['O-', 'A-'];
    case 'A+': return ['O-', 'O+', 'A-', 'A+'];
    case 'B-': return ['O-', 'B-'];
    case 'B+': return ['O-', 'O+', 'B-', 'B+'];
    case 'AB-': return ['O-', 'A-', 'B-', 'AB-'];
    case 'AB+': return ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];
    // Bombay phenotype patients can ONLY receive Bombay blood.
    case 'Bombay (hh)': return ['Bombay (hh)'];
    default: return [recipient];
  }
}
export const isRare = (g: string) => RARE_GROUPS.includes(g);
/** Minimum days between whole-blood donations used to filter out recently-donated donors. */
export const DONATION_INTERVAL_DAYS = 90;
