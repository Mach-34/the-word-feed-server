import { EdDSAPCDPackage } from "@pcd/eddsa-pcd";
import {
  EdDSATicketPCDPackage
} from "@pcd/eddsa-ticket-pcd";
import { EmailPCDPackage } from "@pcd/email-pcd";
import {
  FeedHost,
  PollFeedRequest,
  PollFeedResponseValue,
  verifyFeedCredential
} from "@pcd/passport-interface";
import {
  DeleteFolderPermission,
  PCDAction,
  PCDActionType,
  PCDPermissionType,
  ReplaceInFolderPermission
} from "@pcd/pcd-collection";
import { ArgumentTypeName, SerializedPCD } from "@pcd/pcd-types";
import { SecretPhrasePCD, SecretPhrasePCDPackage } from "@pcd/secret-phrase-pcd";
import _ from "lodash";
import path from "path";
import { SecretPhrase, loadSecretPhrases } from "./config";
import { ZUPASS_PUBLIC_KEY } from "./main";

const fullPath = path.join(__dirname, "../artifacts/");
SecretPhrasePCDPackage.init?.({
  zkeyFilePath: fullPath + "circuit.zkey",
  wasmFilePath: fullPath + "circuit.wasm"
});

EdDSAPCDPackage.init?.({});
EdDSATicketPCDPackage.init?.({});

export let feedHost: FeedHost;

export async function initFeedHost() {
  const phrases = await loadSecretPhrases();
  const folders = Object.keys(phrases);
  feedHost = new FeedHost(
    [
      {
        feed: {
          id: "1",
          name: "The Word Phrases",
          description: "Secret Phrases for \"The Word\"",
          permissions: folders.flatMap((folder) => {
            return [
              {
                folder,
                type: PCDPermissionType.ReplaceInFolder
              } as ReplaceInFolderPermission,
              {
                folder,
                type: PCDPermissionType.DeleteFolder
              } as DeleteFolderPermission
            ];
          }),
          credentialRequest: {
            signatureType: "sempahore-signature-pcd",
            pcdType: "email-pcd"
          }
        },
        handleRequest: async (
          req: PollFeedRequest
        ): Promise<PollFeedResponseValue> => {
          if (req.pcd === undefined) {
            throw new Error(`Missing credential`);
          }
          const { payload } = await verifyFeedCredential(req.pcd);
          if (payload?.pcd && payload.pcd.type === EmailPCDPackage.name) {
            const pcd = await EmailPCDPackage.deserialize(payload?.pcd.pcd);
            const verified =
              (await EmailPCDPackage.verify(pcd)) &&
              _.isEqual(pcd.proof.eddsaPCD.claim.publicKey, ZUPASS_PUBLIC_KEY);
            if (verified) {
              return { actions: await feedActionsForEmail(pcd.claim.emailAddress) };
            }
          }
          return { actions: [] };
        }
      }
    ],
    "http://localhost:3100/feeds",
    "The Word Feed Server"
  );
}

async function feedActionsForEmail(
  username: string,
): Promise<PCDAction[]> {
  const phrasesForUser: Record<string, SecretPhrase[]> = {};

  const phrases = await loadSecretPhrases();
  console.log("A");
  for (const [folder, folderPhrases] of Object.entries(phrases)) {
    for (const phrase of folderPhrases) {
      if (phrase.username === username) {
        if (!phrasesForUser[folder]) {
          phrasesForUser[folder] = [];
        }
        phrasesForUser[folder].push(phrase);
      }
    }
  }
  console.log("B");
  const actions = [];

  for (const [folder, phrases] of Object.entries(phrasesForUser)) {
    // Clear out the folder
    actions.push({
      type: PCDActionType.DeleteFolder,
      folder,
      recursive: false
    });

    actions.push({
      type: PCDActionType.ReplaceInFolder,
      folder,
      pcds: await Promise.all(
        phrases.map((phrase) => issueSecretWordPCD(phrase))
      )
    });
  }
  return actions;
}

// can I just... verify instead of proving based on an input?
async function issueSecretWordPCD(
  phrase: SecretPhrase,
): Promise<SerializedPCD<SecretPhrasePCD>> {
  const pcd = await SecretPhrasePCDPackage.prove({
    phraseId: {
      value: phrase.phraseId,
      argumentType: ArgumentTypeName.Number,
    },
    username: {
      value: phrase.username,
      argumentType: ArgumentTypeName.String,
    },
    secret: {
      value: phrase.secret,
      argumentType: ArgumentTypeName.String,
    },
  })
  return SecretPhrasePCDPackage.serialize(pcd);
}