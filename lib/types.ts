export type Channel = {
  id: string;
  name: string;
  url: string;
  thumbnail: string | null;
  addedAt: string;
};

export type Video = {
  videoId: string;
  channelId: string;
  channelName: string;
  title: string;
  published: string;
  thumbnail: string;
  description: string;
};
