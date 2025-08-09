<img style="width: 178px; height: 178px" src="/image/W.png"><h1>wintre - micro-blogging social media</h1>

this project is powered by firebase & supabase.

## firestore rules
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Likes under user
    match /likes/{userId}/tweets/{tweetId} {
      allow read, create, delete: if request.auth != null && request.auth.uid == userId;
    }

    // Tags and their tweets
    match /tags/{tagId} {
      allow read: if true;
      allow create, update: if request.auth != null;

      match /tweets/{tweetId} {
        allow read: if true;
        allow create: if request.auth != null;
        allow delete: if request.auth != null &&
          exists(/databases/$(database)/documents/tweets/$(tweetId)) &&
          request.auth.uid == get(/databases/$(database)/documents/tweets/$(tweetId)).data.uid;
      }
    }

    // Notifications
    match /users/{userId}/notifications/{notificationId} {
      allow read, update, delete: if request.auth != null && request.auth.uid == userId;
      allow create: if request.auth != null && request.auth.uid != userId;
    }

    // Users and subcollections
    match /users/{userId} {
      allow read: if true;
      allow update: if request.auth != null &&
        request.auth.uid == userId &&
        request.writeFields.size() == 1 &&
        request.writeFields.hasOnly(["posts"]);
      allow write: if request.auth != null && request.auth.uid == userId;

      // Mentions
      match /mentioned/{tweetId} {
        allow read: if request.auth != null && request.auth.uid == userId;
        allow create: if request.auth != null &&
          exists(/databases/$(database)/documents/tweets/$(tweetId)) &&
          userId in get(/databases/$(database)/documents/tweets/$(tweetId)).data.mentions;
        allow delete: if request.auth != null &&
          exists(/databases/$(database)/documents/tweets/$(tweetId)) &&
          request.auth.uid == get(/databases/$(database)/documents/tweets/$(tweetId)).data.uid;
      }

      // Posts
      match /posts/{postId} {
        allow read: if true;
        allow write: if request.auth != null && request.auth.uid == userId;
      }

      // Bookmarks
      match /bookmarks/{tweetId} {
        allow read: if true;
        allow write: if request.auth != null && request.auth.uid == userId;
      }

      // Following
      match /following/{targetId} {
        allow read: if true;
        allow write: if request.auth != null && request.auth.uid == userId;
      }

      // Followers
      match /followers/{followerId} {
        allow read: if true;
        allow write: if request.auth != null && request.auth.uid == followerId;
      }
    }

    // Tweets and subcollections
    match /tweets/{tweetId} {
      allow read: if true;
      allow create: if request.auth != null &&
        request.resource.data.uid == request.auth.uid;
      allow update: if request.auth != null &&
      (
    		// Allow updating likeCount
    		(request.writeFields.size() == 1 &&
     		request.writeFields.hasOnly(['likeCount'])) ||

    		// Allow tweet owner to update pinnedCommentId
    		(request.auth.uid == resource.data.uid &&
     		request.writeFields.size() == 1 &&
     		request.writeFields.hasOnly(['pinnedCommentId']))
  		);
      allow delete: if request.auth != null &&
        request.auth.uid == resource.data.uid;

      // Likes
      match /likes/{userId} {
        allow read: if true;
        allow create: if request.auth != null && request.auth.uid == userId;
        allow delete: if request.auth != null &&
          (request.auth.uid == userId ||
           request.auth.uid == get(/databases/$(database)/documents/tweets/$(tweetId)).data.uid);
      }

      // Views
      match /views/{userId} {
        allow read: if true;
        allow create: if request.auth != null && request.auth.uid == userId;
        allow delete: if request.auth != null &&
          (request.auth.uid == userId ||
           request.auth.uid == get(/databases/$(database)/documents/tweets/$(tweetId)).data.uid);
      }

      // Comments and subcollections
      match /comments/{commentId} {
        allow read: if true;
        allow create: if request.auth != null &&
          request.resource.data.uid == request.auth.uid;
        allow update, delete: if request.auth != null &&
          (request.auth.uid == resource.data.uid ||
           request.auth.uid == get(/databases/$(database)/documents/tweets/$(tweetId)).data.uid);

        // Comment likes
        match /likes/{userId} {
          allow read: if true;
          allow create: if request.auth != null && request.auth.uid == userId;
          allow delete: if request.auth != null &&
            (request.auth.uid == userId ||
             request.auth.uid == get(/databases/$(database)/documents/tweets/$(tweetId)).data.uid);
        }

        // Replies and subcollections
        match /replies/{replyId} {
          allow read: if true;
          allow create: if request.auth != null &&
            request.resource.data.uid == request.auth.uid;
          allow update, delete: if request.auth != null &&
            (request.auth.uid == resource.data.uid ||
             request.auth.uid == get(/databases/$(database)/documents/tweets/$(tweetId)).data.uid);

          // Reply likes
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

## firestore indexes

| Collection ID | Fields indexed                                       | Query scope  |
|---------------|------------------------------------------------------|--------------|
| comments      | `likeCount ↑`, `createdAt ↓`, `__name__ ↓`           | Collection   |
| tweets        | `uid ↑`, `createdAt ↓`, `__name__ ↓`                 | Collection   |
| tweets        | `likeCount ↓`, `createdAt ↑`, `__name__ ↑`           | Collection   |
| tweets        | `likeCount ↓`, `createdAt ↓`, `__name__ ↓`           | Collection   |

## supabase policies

| Policy name         | target roles | expression                    |
|---------------------|--------------|-------------------------------|
| allow_public_read   | anon         | `(bucket_id = 'wints'::text)` |
| allow_public_upload | anon         | `(bucket_id = 'wints'::text)` |

<hr>

made by Nackoo
