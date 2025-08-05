# wintre

## firestore rule
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /likes/{userId}/tweets/{tweetId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow create, delete: if request.auth != null && request.auth.uid == userId;
    }

    match /tags/{tagId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update: if request.auth != null;

      match /tweets/{tweetId} {
        allow read: if true;
        allow create: if request.auth != null;
        allow delete: if request.auth != null &&
          exists(/databases/$(database)/documents/tweets/$(tweetId)) &&
          request.auth.uid == get(/databases/$(database)/documents/tweets/$(tweetId)).data.uid;
      }
    }

    match /users/{userId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;

      match /mentioned/{tweetId} {
        allow read: if request.auth != null && request.auth.uid == userId;
        allow create: if request.auth != null &&
          exists(/databases/$(database)/documents/tweets/$(tweetId)) &&
          userId in get(/databases/$(database)/documents/tweets/$(tweetId)).data.mentions;
        allow delete: if request.auth != null &&
          exists(/databases/$(database)/documents/tweets/$(tweetId)) &&
          request.auth.uid == get(/databases/$(database)/documents/tweets/$(tweetId)).data.uid;
      }

      match /posts/{postId} {
        allow read: if true;
        allow write: if request.auth != null && request.auth.uid == userId;
      }

      match /bookmarks/{tweetId} {
        allow read: if true;
        allow write: if request.auth != null && request.auth.uid == userId;
      }

      match /following/{targetId} {
        allow read: if true;
        allow write: if request.auth != null && request.auth.uid == userId;
      }

      match /followers/{followerId} {
        allow read: if true;
        allow write: if request.auth != null && request.auth.uid == followerId;
      }
    }

    match /tweets/{tweetId} {
      allow read: if true;
      allow update: if request.auth != null &&
        request.writeFields.size() == 1 &&
        request.writeFields.hasOnly(['likeCount']);
      allow delete: if request.auth != null &&
        request.auth.uid == resource.data.uid;
      allow create: if request.auth != null &&
        request.resource.data.uid == request.auth.uid;

      match /likes/{userId} {
        allow read: if true;
        allow create: if request.auth != null && request.auth.uid == userId;
        allow delete: if request.auth != null &&
          (request.auth.uid == userId ||
           request.auth.uid == get(/databases/$(database)/documents/tweets/$(tweetId)).data.uid);
      }

      match /views/{userId} {
        allow read: if true;
        allow create: if request.auth != null && request.auth.uid == userId;
        allow delete: if request.auth != null &&
          (request.auth.uid == userId ||
           request.auth.uid == get(/databases/$(database)/documents/tweets/$(tweetId)).data.uid);
      }

      match /comments/{commentId} {
        allow read: if true;
        allow create: if request.auth != null &&
          request.resource.data.uid == request.auth.uid;
        allow update, delete: if request.auth != null &&
          (request.auth.uid == resource.data.uid ||
           request.auth.uid == get(/databases/$(database)/documents/tweets/$(tweetId)).data.uid);

        match /likes/{userId} {
          allow read: if true;
          allow create: if request.auth != null && request.auth.uid == userId;
          allow delete: if request.auth != null &&
            (request.auth.uid == userId ||
             request.auth.uid == get(/databases/$(database)/documents/tweets/$(tweetId)).data.uid);
        }

        match /replies/{replyId} {
          allow read: if true;
          allow create: if request.auth != null &&
            request.resource.data.uid == request.auth.uid;
          allow update, delete: if request.auth != null &&
            (request.auth.uid == resource.data.uid ||
             request.auth.uid == get(/databases/$(database)/documents/tweets/$(tweetId)).data.uid);

          match /likes/{userId} {
            allow read: if true;
            allow create: if request.auth != null && request.auth.uid == userId;
            allow delete: if request.auth != null &&
              (request.auth.uid == userId ||
               request.auth.uid == get(/databases/$(database)/documents/tweets/$(tweetId)).data.uid);
          }
        }
      }
    }
  }
}
```

## indexes

| Collection ID | Fields indexed                                       | Query scope  |
|---------------|------------------------------------------------------|--------------|
| comments      | `likeCount ↑`, `createdAt ↓`, `__name__ ↓`           | Collection   |
| tweets        | `uid ↑`, `createdAt ↓`, `__name__ ↓`                 | Collection   |
| tweets        | `likeCount ↓`, `createdAt ↑`, `__name__ ↑`           | Collection   |
