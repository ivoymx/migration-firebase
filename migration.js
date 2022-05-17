import fetch from "node-fetch";
import admin from "firebase-admin";

import sourceServiceAccount from "./source-for-migration";
import targetServiceAccount from "./sour";

var sourceApp = admin.initializeApp(
  {
    credential: admin.credential.cert(sourceServiceAccount),
  },
  "source-app"
);

var targetApp = admin.initializeApp(
  {
    credential: admin.credential.cert(targetServiceAccount),
  },
  "target-app"
);

var authFrom = sourceApp.auth();
var authTo = targetApp.auth();

const createOneUserMutation = `mutation CreateOneUser($input: CreateOneUserInput!) {
  createOneUser(input: $input) {
    id
  }
}`;

function migrateUsers(userImportOptions, nextPageToken) {
  var pageToken;
  authFrom
    .listUsers(1000, nextPageToken)
    .then(function (listUsersResult) {
      var users = [];
      listUsersResult.users.forEach(function (user) {
        var modifiedUser = user.toJSON();
        // Convert to bytes.
        if (user.passwordHash) {
          modifiedUser.passwordHash = Buffer.from(user.passwordHash, "base64");
          modifiedUser.passwordSalt = Buffer.from(user.passwordSalt, "base64");
        }
        // Delete tenant ID if available. This will be set automatically.
        delete modifiedUser.tenantId;
        //
        // Lógica para crear user en auth

        //
        users.push(modifiedUser);
      });
      // Save next page token.
      pageToken = listUsersResult.pageToken;
      // Upload current chunk.
      return authTo.importUsers(users, userImportOptions);
    })
    .then(function (results) {
      results.errors.forEach(function (indexedError) {
        console.log("Error importing user " + indexedError.index);
      });
      // Continue if there is another page.
      if (pageToken) {
        migrateUsers(userImportOptions, pageToken);
      }
    })
    .catch(function (error) {
      console.log("Error importing users:", error);
    });
}
var userImportOptions = {
  hash: {
    algorithm: "SCRYPT",
    // The following parameters can be obtained from the "Users" page in the
    // Cloud Console. The key must be a byte buffer.
    key: Buffer.from(
      "XDHG8wVPRwwxSRboT6i/wuI3PMIm81o1CrMmKDm/Veo89sDX/eiOWrw7cthBzm0/Dy6HPblkvQZZJluh7skh3Q==",
      "base64"
    ),
    saltSeparator: Buffer.from("Bw==", "base64"),
    rounds: 8,
    memoryCost: 14,
  },
};

migrateUsers(userImportOptions);
