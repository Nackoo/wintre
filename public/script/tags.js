import { db, doc, setDoc, collection } from "./firebase.js";

export async function handleTags(text, tweetId) {

  const tagMatches = text.match(/#\w+/g);
  if (!tagMatches) return;

  const uniqueTags = [...new Set(tagMatches.map(t => t.slice(1)))];

  for (const tag of uniqueTags) {

    try {
      const tagDoc = doc(db, "tags", tag);
      await setDoc(tagDoc, {
        name: tag,
        createdAt: new Date()
      }, {
        merge: true
      });

      const tagRef = doc(collection(db, "tags", tag, "tweets"), tweetId);
      await setDoc(tagRef, {
        taggedAt: new Date()
      });

    } catch (e) {
      alert(`Tag save failed for #${tag}: ${e.message}`);
    }
  }
}