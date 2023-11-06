import { readFile } from "jsonfile";
import { z } from "zod";

const SecretPhraseSchema = z.object({
  phraseId: z.string(),
  username: z.string(),
  secret: z.string(),
  secretHash: z.string(),
});


export type SecretPhrase = z.infer<typeof SecretPhraseSchema>;

const SecretPhraseFileSchema = z.record(z.array(SecretPhraseSchema));

export async function loadSecretPhrases(): Promise<Record<string, SecretPhrase[]>> {
  const phrases = SecretPhraseFileSchema.parse(await readFile("./feed/phrases.json"));
  return phrases;
}