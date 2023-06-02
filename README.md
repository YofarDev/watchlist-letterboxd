# watchlist-letterboxd

An addon to add your Letterboxd watchlist to Stremio

It's really not user friendly to use (I don't really know js so sorry for the mess) but if you want to try, you need to download your watchlist as a csv from letterbox, rename it with your username and put it in the folder of the addon.
In addon.js change the line 'const username = "yofaraway"' with your username and run it from the terminal with "npm start".
(copy the local address printed in stremio addon to install it).

After the first time, you can enable the update mode by changing false in "initDataset(false)" to true (to not have to download a new CSV each time) but it will scrap your watchlist from letterboxd, so the longer your watchlist is, the more time it will take.

It may be possible to make this addon works without server but I have no idea how.
