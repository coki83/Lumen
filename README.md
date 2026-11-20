# Lumen

One library for every PC game. Lumen finds what you have installed in Steam, Epic Games, GOG, EA app, Ubisoft Connect, Xbox / Microsoft Store (PC Game Pass), Battle.net and Amazon Games, shows it all in one place, and starts each game through its own launcher so saves, achievements and cloud sync keep working. Anything else (emulators, itch.io, DRM-free games) can be added by hand.

It shows both what you have installed and, where the launcher allows it, everything you own but haven't installed (dimmed, with an Install button that opens the right launcher).

It has two modes:

- **Desktop**: sidebar with launchers and your own collections, a home page with a spotlight and shelves, cover grid or list view, search, sorting, a game page with notes and stats, and a right-click menu.
- **Big Screen**: a full-screen TV-style mode for a controller, with rows or a grid, a game detail screen, and a quick menu.

## Run it

**Ready-made build**: unzip `Lumen-0.1.0-win.zip` anywhere and run `Lumen.exe`. It isn't code-signed, so Windows SmartScreen may warn the first time ("More info" → "Run anyway").

**From source** (needs Node.js 20 or newer):

```
npm install
npm start          # build and open the app
npm run dev        # hot-reload development
npm run dev:web    # UI only, in a browser, with sample games
npm run dist       # Windows installer + portable exe in release/
```

Build the installer on Windows. Building it on Linux or macOS needs Wine.

GitHub Actions builds Lumen on Windows for every push (`.github/workflows/build.yml`) and leaves the
zip, the installer and the portable exe as artifacts. Pushing a tag like `v0.1.0` puts the same files
on a GitHub release.

## How each launcher is found

| Launcher | Where Lumen looks | How it starts the game |
|---|---|---|
| Steam | Registry for the Steam folder, `libraryfolders.vdf`, `appmanifest_*.acf` in every library | `steam://rungameid/<id>` |
| Epic Games | `%ProgramData%\Epic\EpicGamesLauncher\Data\Manifests\*.item` | `com.epicgames.launcher://apps/…?action=launch` |
| GOG | `HKLM\SOFTWARE\WOW6432Node\GOG.com\Games` | The game's exe directly (DRM-free) |
| EA app / Origin | Uninstall entries + `__Installer\installerdata.xml` | `origin2://game/launch?offerIds=…` |
| Ubisoft Connect | `HKLM\SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs` | `uplay://launch/<id>/0` |
| Xbox / Microsoft Store | Installed app packages that contain `MicrosoftGame.config` (PowerShell) | `shell:AppsFolder\<family>!<app>` |
| Battle.net | Blizzard uninstall entries (`--uid=`) | `battlenet://<product code>` |
| Amazon Games | Uninstall entries from "Amazon Game Remover" | `amazon-games://play/<id>` |

### Sign in to your accounts

Settings → Launchers (or Settings → Accounts) has a **Sign in** button for every launcher. You sign in on the launcher's own web page in a separate window, so Lumen never sees your password; it keeps only a sign-in token, encrypted for your Windows account.

- **Steam, Epic Games, GOG**: the same sign-in other open launchers (Heroic, Playnite, Legendary) use. Loads every game you own, plus play time for Steam and Epic.
- **Xbox**: Microsoft sign-in. Lists the PC games you've played with that account, including Game Pass.
- **EA, Ubisoft, Battle.net, Amazon Games**: experimental. These launchers have no official way for other apps to read a library, so Lumen uses each one's own website sign-in. If a launcher changes its site, that sign-in can stop working; Settings shows the reason, and installed games still appear either way.

### Games you own but haven't installed

| Launcher | How | What you need |
|---|---|---|
| Steam | Steam Web API | A free API key from steamcommunity.com/dev/apikey and your SteamID64 or profile name. If nothing appears, set Profile → Privacy → Game details to Public. |
| Epic Games | The Epic launcher's local library cache | Nothing. Open the Epic launcher's Library once so the cache is fresh. |
| GOG | GOG Galaxy's local database | GOG Galaxy installed and signed in. |
| Ubisoft, EA, Xbox, Battle.net | Through GOG Galaxy integrations | Connect those accounts inside GOG Galaxy (Settings → Integrations). They have no public way to read your library otherwise. |
| Amazon Games | The Amazon Games app's local database | Nothing. |

All of this is in Settings → Launchers, along with a switch to hide games that aren't installed. The toolbar has the same switch.

Any launcher can be switched off in Settings → Launchers, and Steam and Epic accept a custom folder. Any game's launch command can be overridden in its editor.

## Explore: deals, best sellers and SteamDB

The Trending & deals page starts with **Trending on Steam this week** (games climbing the charts or new in the top 100) and **Most played on Steam right now**. These come from Steam's own public charts service, the same numbers chart sites show; Lumen does not read SteamDB's pages, which SteamDB asks programs not to do. A link opens SteamDB's charts inside Lumen for more.

SteamDB, the Steam store, the Epic store and GG.deals (price comparison for buying games) open inside Lumen without an address bar. Back, forward, reload, start page and "open in your browser" sit next to the page title in Lumen's top bar.

### Game lookup (free Steam scraper)

Explore → Game lookup searches any Steam game by name or App ID and shows its price and discount, review score, user tags, players online right now, developer, publisher, release date, Metacritic, achievements, DLC count, platforms and screenshots. **Export CSV** saves the results as a spreadsheet. It reads Steam's public store pages and APIs directly, so it's free and needs no account. The same details show on each game's page in your library. With nothing searched, the page shows a random pick of everything on sale or free on Steam and Epic right now; press Shuffle for another set.


- **Deals & best sellers**: Epic's free games (now and coming next), Steam and Epic games on sale, Steam and Epic top sellers, and new releases on Steam. Prices come from each store's public storefront for your region. Games you already own are marked "In library". Click a game to open its store page inside Lumen.
- **SteamDB, Steam store, Epic store**: full browser tabs inside Lumen with back, forward, reload and "open in your browser". SteamDB doesn't offer an API, so Lumen shows the real site rather than copying its data.

## Power menu

The Power button (bottom of the sidebar, top right in Big Screen, or the controller's View button) offers Sleep, Lock, Restart, Shut down, Exit Big Screen and Quit Lumen. Shut down and Restart ask first; that can be turned off in Settings → General.

## Sound, music and live wallpapers

Every sound, music track and wallpaper in Lumen is original and generated live in the app. Nothing is copied from any console.

- **Interface sounds:** four styles. Lumen (soft bells), Crisp (short techy clicks), Bubbly (playful pops) and Airy (spacious, echoing tones), plus Off and a volume slider.
- **Background music:** four calm generated pieces (Drift, Late night, Plaza, Deep space), or your own music file (MP3, OGG, FLAC, WAV, M4A). It can play only in Big Screen or everywhere, and stops while a game runs.
- **Live wallpapers:** Ribbons, Orbs, Tiles, Aurora, Starfield, Horizon, Constellation, Bubbles, Rain, Snow, Fireflies, Ripples and Dusk hills, tinted with your accent color, or your own looping video (MP4, WebM). Big Screen can use the wallpaper or the selected game's art.

## Tile shapes and scrolling

Settings → Library → **Tile shape** switches every game tile between Tall cover, Wide banner (uses landscape artwork) and Square, in both the desktop view and Big Screen. **Home rows** chooses whether desktop Home rows scroll sideways or wrap onto lines. Settings → Big Screen → **Row movement** chooses how rows move as you go sideways: Follow, Centered, or Page by page. Scrolling (rows or grid) and Card size are in the same tab.

The space between tiles grows with the tiles. A picked tile swells a little where it stands, so on a big TV, with wide banners or with Card size set to Huge, a fixed gap used to run out and the selected game lapped over the ones beside it. The gap is now worked out from the tile width in both views, so the picked tile always has room around it.

## Logo, intro and outro

The Lumen mark is a power button: one ring with a gap at the top and one stem through it, drawn in the accent colour and nothing else. It is a stroke rather than a filled shape, which is what lets the intro draw it.

![The intro, frame by frame](logo-animation.png)

The intro and outro marks are sized to the screen, not to a number of pixels: about a third of the shorter side, which is a badge on a monitor and still a badge on a 65 inch television. The word under them grows with them.

The intro is one line being drawn. It arrives hairline thin, travels round the circle, the stem drops through the gap, and only once the shape is closed does the whole mark thicken to its real weight. It takes about 1.6 seconds, and the word LUMEN starts appearing at the moment the thickening starts. Leaving Big Screen plays the same thing backwards: the mark thins, the stem lifts out and the ring unwinds. Both come with a chime, and both are off under Settings → Big Screen → Intro and outro animation. The system setting for reduced motion skips the drawing entirely and shows the finished mark.

### Picking a mark

Settings → Appearance → Lumen mark holds five of them, and every tile in the picker is the real mark really animating, because a still picture says nothing about the half of it that moves. Picking one plays all five over, which is the only fair way to compare them.

| | |
|---|---|
| **Power** | A power button. The line draws, then thickens. The one Lumen starts with. |
| **Orbit** | One tilted orbit with a moon riding it, around the light. The whole orbit swings round into place as the path draws. |
| **Pulse** | One closed ring and the light inside it. |
| **Reactor** | Three arcs of one circle, arriving one after the other. |
| **Spark** | Lumen's first ring, with its light brought into the middle. The break in the ring is what is left of the spark. |

Every mark but Power has a **core**, and the core is a power light: it comes on green as Lumen starts and turns red as it goes off, flaring once on the way in and once on the way out. It is the only part of the mark that ignores your accent colour, because there the colour is the message.

![Every mark, finished and part way through](logo-styles.png)

The mark you pick also becomes Lumen's **window and taskbar icon**, straight away, with no restart. The icon on the desktop shortcut and in Explorer stays the Power mark whatever you choose: Windows reads that one out of the exe, which is written when Lumen is built, and nothing running can change it afterwards.

Logo files (SVG and PNG: mark, app icon, wordmark in dark and light) are in the `logo` folder next to this README.

## Animations

Menu icons move when you hover or select their button: gears turn, the home icon bounces, stars beat, arrows nudge, outlines redraw themselves. A selected game pops forward, a light sweeps across it, its artwork drifts slowly and its glow breathes. Settings → Appearance → Animations lets you choose the style: menu icons can be Lively, Pop, Draw, Spin or Off; a selected game can do Everything, Pop, Shine, Glow, Float, Tilt or Off; and speed can be Slow, Normal or Fast, with a live preview. Reduce motion turns all of it off.

## Menus and weather

Settings → Menus & weather lets you reorder and hide the desktop sidebar items (and hide the Launchers and Collections lists), and reorder or hide the Big Screen tabs. The Big Screen tabs are Home, Controller, Library and Favorites; the Controller tab lists only the games that take a controller, full support first, then partial, each sorted by play time. The Big Screen menu (B or Start) is grouped into Library, Look, Sound and System.

Turn on **Show local weather** to see the temperature in the desktop top bar and next to the Big Screen clock. Type a city, or leave it empty to detect a rough location from your internet connection (via ipwho.is). Weather data comes from Open-Meteo; both are free and need no account. **Use the weather as live wallpaper** (or the Weather tile in the wallpaper picker) switches the live background to match the sky: rain, snow, fog, cloud, clear day or clear night.

Home shows a **vibes** card: a short read of the day and a few picks from your own library to suit it. The weather is one of the moods (your most played games on a rainy day, something you never started on a grey one), and the rest come from the time of day and the shape of your library: **Positive vibes** for the ones that never let you down, **Fresh start** for games you have never opened, **Comeback** for the ones you put down a month ago, **Quick one** for a short session, **Late one** after nine in the evening, **Morning vibes** before eleven, and **Deep dive** for the long ones. A mood is only offered when it has games to stand on. Big Screen gets the same picks as a row and the card at the top right.

Three of the moods read from the internet instead of your library. **Game news** is the gaming press: the headlines from Google News' Gaming topic, newest first, each with its publisher and how long ago it ran, and clicking one opens it inside Lumen. **Just released** is what came out on Steam in the last days. **Most played in the world** is Steam's own live chart, the ten games with the most people in them right now with their player counts. None of it needs a key or an account, and nothing about you is sent: the news request carries a topic and a language and nothing else, and the Steam calls carry nothing of yours either. They are refreshed every half hour, and if a source cannot be reached the card says so and keeps the last list it had.

The headlines are read from Google News' own RSS, which is the topic page with `/rss/` in front of `/topics/`, in the edition matching the language set under Menus & weather; an edition with nothing to say falls back to the English one. Each headline carries its publisher's mark, fetched from Google's favicon service by the publisher's domain alone. Should Google News be unreachable altogether, the card falls back to what it used to show: patch notes and announcements from the Steam news feeds of the games you own. That request carries the ids of games already in your library and nothing else. The card does not sit still: the news list and the picks move on to the next few every six seconds with a short fade, and small dots under them show how many pages there are. In Big Screen the card stays short so it never covers the first row of games.

A game's Steam news feed mixes every language the developer posts in, and Steam offers no way to ask for one. So Lumen reads each announcement itself: the writing system has to match yours, and for languages that share the Latin alphabet a handful of very common words decide which one it is. A headline too short to tell, like "Patch 1.4", is kept. Set it under **News language** in Settings, Menus and weather: your Windows language by default, one of thirty odd languages, or "Any language" to see everything. Languages that share a script, like Macedonian and Russian, cannot always be told apart from a title alone.

Settings, Menus and weather, **Vibes card** sets how it looks and which mood it uses. The looks are Panel (a flat panel with an accent edge), Soft (a gentle tint), Outline (just a thin line), Photo (the first pick's artwork, dimmed), Bold (filled with your accent colour), Glass (frosted and see-through) and Off, which leaves the card out of both views. Mood is either "Rotate daily", which gives you a different one each day and puts an "Another vibe" button on the card to step through the rest, or one mood that stays. A mood you pick works at any hour, even the ones that normally only show up in the morning or late at night.

## Couch mode and Windows Xbox mode (FSE)

Settings → Big Screen → **Set up couch mode** does the sofa setup in one click: Lumen starts with Windows, opens straight into full screen Big Screen, and gets a "Lumen Big Screen" desktop shortcut plus a `lumen://bigscreen` link. Starting `Lumen.exe --bigscreen` (or the link) while Lumen is already open switches the running window to Big Screen.

Windows 11's Xbox mode (full screen experience) only accepts Store-style packaged apps as its home app, so Lumen can't be chosen there directly. A small bridge app can take that slot and start Lumen: Windows starts the bridge, the bridge starts Lumen in Big Screen, and the PC comes up on the TV with nothing on it but Lumen.

Use **[AnyFSE](https://github.com/ashpynov/AnyFSE/releases/latest)** (MIT). It can be pointed at a custom program, so Lumen goes in as itself.

1. Turn on couch mode.
2. Unlock the full Xbox mode with the free [Xbox Full Screen Experience Tool](https://github.com/8bit2qubit/XboxFullScreenExperienceTool): install it, press "Enable Xbox Mode (FSE)" and let the PC restart. Normal PCs need this to get "Choose home app". It changes Windows system settings, so make a restore point first; its "Disable & Restore" button undoes it. Lumen shows whether it is installed and checks your Windows build (26100.7019 or newer).
3. Install AnyFSE: download `AnyFSE.Installer.exe` from its releases page and run it. It wants administrator rights and may draw a Defender warning, because registering itself with Windows as a home app means touching developer mode and the certificate store. The settings page has a button for the download and says whether it is already installed.
4. Find AnyFSE in the Start menu, right-click it and choose **Configure**. Pick the custom executable option and give it the path to `Lumen.exe` with the startup argument `--bigscreen`. The settings page has copy buttons for the path, the argument and the `lumen://bigscreen` link.
5. In Windows Settings → Gaming → Full screen experience, choose AnyFSE as the home app and turn on entering it at startup.

[OmniConsole](https://8bit2qubit.github.io/omniconsole-site/download/) does the same job if you already use it: install it, add Lumen as a custom platform with the same path and argument, and choose OmniConsole in step 5 instead.

**Lumen never installs either bridge for you.** Between them they want administrator rights, a certificate in Trusted People and Windows' developer mode, and that is not a games launcher's business. Lumen finds them, links them, and hands you the exact path and argument to paste.

Xbox mode needs Windows 11 24H2 or newer. AnyFSE, OmniConsole and the Xbox Full Screen Experience Tool are separate projects with their own licenses and none of them is bundled with Lumen. If "Choose home app" is missing, update Xbox and Xbox Game Bar in the Microsoft Store.

## Game info

Each game page has an About section with the description, developer, publisher, release date, genres, features, Metacritic score and screenshots from the official Steam store API, plus links to the Steam store and to SteamDB. SteamDB has no public API and doesn't allow automated scraping, so Lumen links to it instead of pulling data from it. Non-Steam games are matched to the Steam store by name, and the page says so. Results are cached for a week.

## Controls and shortcuts

Settings → Controls lets you rebind every navigation action to any key and any controller button, change all app shortcuts, and set one system-wide shortcut that opens Big Screen even when Lumen is in the background.

Default app shortcuts: Ctrl+B Big Screen, Ctrl+F search, F5 rescan, Ctrl+, settings, Ctrl+Shift+P power menu, Ctrl+N add a game, Ctrl+Shift+M music on or off, F11 full screen.

## Customization

- 8 themes (Ember, Tide, Orchid, Moss, Arcade, Graphite, Paper, Frost), any accent color, 4 font styles, text size, density, corner roundness
- Background: theme, the selected game's art (with blur and dim), or your own image
- Covers or list layout, cover size slider, titles and launcher badges on or off, collapsible sidebar
- Your own collections, favorites, hidden games, notes and display names
- Per-game cover, background and logo from a file, a URL, or SteamGridDB search
- Big Screen: horizontal rows or a vertical grid, card size (Medium, Large, Huge), choose and reorder home rows, start in Big Screen. Mouse wheel and touchpad scroll work too (Shift+wheel moves sideways)
- Start with Windows, minimize when a game starts

### Artwork

Lumen has its own free art scrapers, no keys or paid services. Each one has an on/off switch in Settings → Artwork. After each scan they run in this order and stop at the first cover found:

1. **Steam images on this PC** (`Steam\appcache\librarycache`): the exact images the Steam client shows, works offline.
2. **Steam store** (`IStoreBrowseService/GetItems`): correct names and current image paths, also used for games from other launchers that are on Steam too.
3. **Epic Games store** and **GOG store**, by exact game name.
4. **Wikipedia**: box art from the game's article.
5. **Web image search**: last resort. Searches the web for "<game> game cover" and takes a portrait picture whose title names the game. It can occasionally pick a wrong picture.
6. **SteamGridDB**, only if you add a free key.
7. A generated cover.

If a cover fails to load, the card tries the next image it knows about before falling back. **Find missing artwork now** runs the whole search on demand and tells you how many games it fixed. To pick art by hand, right-click a game → Edit and artwork → Find.

Leftover entries with no name (DLC, tools, soundtracks from an older scan) are removed automatically on the next scan unless you've edited them.

### Most played first

The library is sorted by play time by default (Settings → Library → Sort games by). Play time is combined from Steam (your account, or `localconfig.vdf` on this PC), Epic (your account's play time) and anything Lumen tracked itself, whichever is highest. Home and Big Screen also have a "Most played" row. GOG, EA, Ubisoft, Xbox and Battle.net don't share play time, so those games only count time played through Lumen.

### Launcher icons

The badges next to each game and in the sidebar use the real icon of each launcher installed on your PC. Launchers that aren't installed fall back to a coloured letter badge.

A launcher that isn't installed on this PC (for example when you only signed in to it) has no program to read an icon from, so Lumen fetches the icon of that launcher's own website once and keeps it.

## Keyboard and controller in the desktop view

The desktop view works without a mouse. Arrow keys or the stick move a highlight between games and the sidebar (left from the first column goes to the sidebar, right comes back). Enter / A opens the highlighted game or sidebar item, X plays it, Y toggles favorite, Esc / B goes back, LB and RB step through the sidebar pages, Start opens Settings and View opens Power. On a game's page, A or X plays and B closes. Keys and buttons follow your bindings in Settings → Controls.

## Controls in Big Screen

The button hints along the bottom fade out a few seconds after your last press and come back the moment you touch a button or move the mouse. Settings > Big Screen > Button hints can keep them on for good or switch them off, and off takes the row away altogether.

Big Screen hides the mouse pointer. A launcher's install or uninstall box leaves the Windows arrow wherever it was last clicked, and on a TV there is no mouse to move it away, so Lumen keeps the pointer hidden and brings it back only while a mouse is really moving.

| Controller | Keyboard | Action |
|---|---|---|
| D-pad / left stick | Arrows | Move |
| A | Enter | Open details / select |
| X | P | Play now |
| Y | F | Search your games (on a game's page it still toggles favorite) |
| B | Esc | Back. On the Home tab it opens the menu (Settings, quick options, Power, Exit Big Screen) |
| LB / RB | Q / E | Switch tab |
| Start (Menu) | M | Quick menu (theme, sounds, music, layout, scan, power, exit) |
| View (Back) | O | Power menu |
| | F11 | Full screen on or off |

There's also an Exit button in the top right corner and in the bar along the bottom.

Opening Settings in Big Screen slides the library to the left and brings the settings panel in from the right edge, so the two feel like one screen rather than a box dropped on top. B slides it back. Turning on Reduce motion in Settings → Appearance makes it switch without the slide.

### Search with the on-screen keyboard

Y opens search over whatever you were looking at. An on-screen keyboard fills the lower half: the stick or D-pad moves the highlight, A types the key, X is backspace, LB is Caps and RB is a space. Results appear above the keyboard as you type, best match first, and LB / RB step through them once there is more than one. Y or Start opens the highlighted result, X plays it straight away, and B closes search. A real keyboard types into it too, with Backspace to delete and Esc to close.

### Installing without leaving Lumen

Press Install and Lumen asks the launcher to download the game, then follows the progress itself. The launcher still shows its own install box, which only it can answer, so answer that one and Lumen takes the screen back: as soon as the download is really running, the launcher's window is minimized and Lumen comes forward. On a TV the controller works as a mouse for that box. Turn the whole thing off in Settings → Big Screen → "Stay in Lumen while a game installs".

## "Windows protected your PC" when Lumen starts

That box is Microsoft Defender SmartScreen, and it appears for any program Windows has not seen before that was not signed with a paid certificate. It is not a virus warning and Lumen cannot switch it off, by design: no program can silence SmartScreen about itself.

What does make it stop, in ten seconds and for every future build:

1. Right-click the Lumen zip **before** unzipping it.
2. Properties, tick **Unblock** at the bottom, OK.
3. Unzip and run `Lumen.exe`.

Windows marks everything that comes out of a downloaded zip as "from the internet", and that mark is what SmartScreen reacts to. Unblocking the zip first removes it from every file inside. If you already unzipped, open PowerShell in the folder holding `Lumen.exe` and run `Get-ChildItem -Recurse | Unblock-File`.

The only way to stop the warning without unblocking is a code signing certificate bought from a certificate authority, which needs an identity check and a yearly fee. An EV certificate is quiet from the first run; a cheaper OV one only once enough people have run the app. The same note ships inside the zip as `READ ME FIRST.txt`.

## Achievements

Every game page now shows an achievements line with its own icon: a medal while you still
have some to earn, and a gold trophy once the game is at 100 percent. Next to it Lumen shows
how many you have earned out of the total, the percentage, and a small bar that fills as you
go. You see it on the game page in Desktop view, bigger on the game page in Big Screen, and
the plain total also shows in the store info line.

The earned count comes from Steam, so it needs a Steam Web API key and your Steam ID in
Settings. Without them Lumen still shows the game's total number of achievements from its
store page, just without your progress. Games from other launchers show the total only, since
those launchers do not publish per game achievement data.

## Emulation: games from Quiver Launcher

Lumen reads the library of [Quiver Launcher](https://github.com/tgeorgiadis/quiver-launcher), which installs the ports, recompilations and fan projects people publish on GitHub, GitLab and other forges, many of them console games brought to the PC. Its games appear in Lumen under their own **Emulation** tab: a sidebar item in the desktop view, between Recently played and Trending & deals, and a Big Screen tab between Controller and Library. The tab is always there, and says where Lumen looked when it finds nothing; hide it in Settings → Menus & weather if you do not use Quiver. Quiver is also listed with the other launchers in the sidebar and in Settings → Library, where it can be switched off like any of them.

Lumen finds Quiver's own state in `%APPDATA%\com.quiverlauncher.app` (it also looks under `%LOCALAPPDATA%` and for the folder names `Quiver Launcher` and `QuiverLauncher`) and reads three files from it: the library, the installs and the catalog copy. From those it takes each game's name, its artwork (the capsule, hero and logo Quiver already has) and the folder it was installed into. Nothing is ever written back. If you keep Quiver's data somewhere else, point Lumen at that folder in Settings → Library, next to the Quiver switch.

Play starts the game's own program directly, the same way Quiver's desktop and Steam shortcuts do, so it works without Quiver running. When the install records which program to start, that one is used; otherwise Lumen picks the most likely .exe in the install folder and ignores uninstallers and setup helpers. A Quiver Launcher 3 library is read too: its `apps.json` (or the older `games.json`), in `%LOCALAPPDATA%\QuiverLauncher` or beside a portable copy in your home, Downloads, Desktop, Games, Documents or Apps folder. Games Quiver knows about but has not installed are left out, since getting them is Quiver's own job. Quiver Launcher itself is not bundled with Lumen and none of its code is used: it is source-available under the Business Source License 1.1, and Lumen only reads the files it leaves on your PC.

## Temperatures

CPU, graphics card, motherboard and drive temperatures sit under Drive space in the desktop sidebar, **next to the Big Screen clock**, at the top of the Big Screen menu and in Settings, read again every fifteen seconds and only while the window is actually on screen. In Big Screen the header shows the CPU and the graphics card without opening anything; on a narrow window there is only room for the hotter of the two, and the rest is in the tooltip and in the menu. A reading turns amber when the part is warm and red when it is hot, with its own limits per part, because a drive at 60 °C is in trouble long before a CPU is. Where a machine reports a sensor per core, the line shows the hottest one and the tooltip lists them all.

Where the numbers come from, in order:

- **A hardware monitor you already run yourself**, if it publishes over WMI (`root/OpenHardwareMonitor` or `root/LibreHardwareMonitor`). The only source that has a motherboard, so it wins when it answers. Lumen does not ship one and does not install one.
- **nvidia-smi**, which ships with the NVIDIA driver, for the graphics card.
- **Windows' own thermal zones**, which many desktop boards answer vaguely or not at all, as a last resort for the CPU.
- **The drives themselves**, through the storage reliability counters, which works on most SATA and NVMe disks whatever else is installed.

### No helper program

**Lumen installs nothing to read temperatures, and ships no sensor program.** LibreHardwareMonitor was bundled for a day and has been taken out again, at Coki's request: the binaries, the automatic setup, the Windows permission prompt, the logon task and the licence files are all gone, and the Windows zip is back to 118 MB.

That sets an honest limit. A per-core CPU reading and a motherboard reading can only come through a kernel driver, and Windows offers none, so on most desktops the list is the graphics card and the drives, sometimes with a rough CPU thermal zone. Settings says exactly that rather than pretending a sensor is missing.

If you already run a hardware monitor of your own and it publishes over WMI, Lumen picks its readings up, motherboard included. It is only read; it is never started, installed or configured by Lumen.

**Check the sensors**, in Settings > General > Temperatures, asks for a fresh read and says what came back, such as "3 readings (gpu, disk), from Windows itself". When nothing comes back it says which of the two reasons it is: a PC that reports nothing Windows can reach, or PowerShell blocked. The Big Screen menu shows the same line.

Settings > General > Temperatures has the switch to hide the whole thing, and Menus & weather > Desktop sidebar can hide just the sidebar block. With no sensor readable, Settings says so and the panels stay out of the way.

## Drive space

Lumen shows how much room is left on every drive Windows can see: a **Drive space** block at the bottom of the desktop sidebar, the same block at the top of the Big Screen menu, and a bigger one in Settings → General. Each drive has its letter, its name, how much is free, a bar for how full it is, and how many of your installed games live on it. The bar turns amber once less than a fifth is free and red under a tenth, so a drive that is filling up is obvious before you start a download.

The numbers come from Windows itself (the logical disks it reports), including removable drives with games on them, and they are read again every minute while a panel is open. Nothing is sent anywhere. You can hide the sidebar block in Settings → Menus & weather, where it sits with the Launchers and Collections lists.

## Tile styles

Settings → Library → Tile style changes the frame around every game tile, in the desktop view and in Big Screen alike. Each choice is previewed on a real game from your library.

- **Classic**: soft shadow and a gentle lift, the look Lumen starts with.
- **Flat**: a quiet outline, nothing moves. Easiest on a slow PC.
- **Framed**: the artwork sits inside a mat, like a picture in a frame.
- **Glass**: a frosted pane with a lit top edge.
- **Neon**: every tile ringed in your accent colour, bright when picked.
- **Shelf**: tiles stand on a surface with a shadow pooling under them.
- **Sticker**: a thick cut edge and a hard offset shadow.
- **RGB**: a turning rainbow ring that marks the game you are on. The other tiles stay plain, and the selected one gets the ring plus a soft glow of the same colours just inside its edge. The whole effect stays inside the picture, and its thickness is a share of the tile, so it looks the same on a small cover in the grid and on a wide banner across a TV. The ring is its own layer, so the artwork keeps its rounded corners and the ring keeps turning whatever you choose in Settings → Appearance → Animations. Reduce motion stops it, as it stops every other animation.

Tile style is about the frame. The animation when a tile is picked is separate, in Settings → Appearance → Animations.

## Uninstalling a game

A game's page has an Uninstall button, in the desktop view and in Big Screen, and it is also in the right-click menu on a tile. Lumen asks first, then starts the game's own uninstaller: Steam's uninstall box for a Steam game, and the entry the launcher registered in "Apps & features" for everything else. Lumen never deletes files itself. That uninstaller opens its own window, which knows nothing about a controller, so in Big Screen the stick becomes the mouse for it, A clicks and B is Escape, exactly as it works for the install box. It stops as soon as the game is gone. If a game registered no uninstaller Lumen can see, Windows opens its own list of apps so you can finish there. The library updates itself once the uninstaller is done.

## Your controller

Every connected controller is listed under the Lumen logo, in the desktop sidebar and in the top left of Big Screen. With more than one, each line carries its player number, so two of the same pad still tell apart. Big Screen names up to two and shows a count beyond that, to keep the header small; the pad icon in the corner lists them all. The name comes from the controller itself, tidied up for reading: "DualSense Wireless Controller", "8BitDo Ultimate 2C Wireless" and so on. Every Xbox pad simply says "Xbox controller", because Windows hands over even a brand new Series pad under the old "Xbox 360 Controller" name, so the model in that string says nothing about the pad in your hands. An Elite or Adaptive pad keeps its model name. A pad that reports no usable name is shown by its maker where we can tell, and otherwise simply as "Compatible controller". Nothing is shown when no controller is connected. Some pads only appear to the app after their first button press, which is a browser rule, not a Lumen one.

### Battery

A controller whose charge Windows knows shows a battery beside its name, and beside the pad icon in the Big Screen header. The bar empties as the charge does, turns amber under a third and red under 15%, and the percentage sits next to it. In a Big Screen window narrower than 1500 pixels the header one is left out, because the row cannot hold it without pushing Exit off the screen; the one under the logo stays.

**It only appears when Windows has a number to give.** There is no clean way to ask: the Gamepad API has no battery at all, and the one Windows call that answers properly for an Xbox pad is a C function that needs a native module Lumen does not have. What is left is Windows' own device store, where a device that reports its charge publishes it on its Plug and Play entry, and that is what Lumen reads, once a minute at most and never while the window is hidden.

In practice that means a pad paired over **Bluetooth** on Windows 10 or 11. A pad on a cable has nothing to report, since it is running off the cable, and a pad on an Xbox wireless adapter usually keeps its charge to itself. When nothing comes back, no battery is drawn: an invented number is worse than none.

## Scanning

Lumen scans every launcher on its own each time it starts, so a game you installed or removed outside Lumen is already in the right place. It runs in the background, so your library shows straight away and fills in when the scan finishes. Turn it off in Settings → Library → "Scan launchers when Lumen starts", and scan by hand any time with F5, the sidebar button, or the Big Screen menu.

Works with Xbox, PlayStation and most other controllers that Windows sees as a standard gamepad.

## Where your data lives

`%APPDATA%\Lumen\`: `library.json` (games, favorites, collections, notes, play history), `settings.json`, and `artwork\` (images you import). Rescans never overwrite your edits.

## Known limits

- Play time comes from Steam and Epic, plus games Lumen starts directly. Games from other launchers started through that launcher record the launch and date, but not the length.
- Lumen does not install, update or uninstall games itself. The Install button hands off to the original launcher.
- The scanners follow each launcher's current file and registry layout. If a launcher changes it, that source may show 0 games until the scanner is updated. Settings → Launchers shows what each scan found.

## Project layout

```
electron/          main process: window, IPC, launching, storage
  scanners/        one file per launcher
shared/types.ts    types shared by both sides
src/               React UI
  views/           Desktop, BigScreen, Settings, GameEditor, AddGame
  lib/             themes, gamepad input, library helpers, browser mock
  styles/app.css   all styling
```

Built with Electron 33, React 18, TypeScript and Vite. No native modules, so `npm install` needs no build tools.

## Controller icons in Big Screen

Games that support a controller show a small gamepad mark in the corner of their tile in Big Screen. An accent colored gamepad means full controller support, a grey one with "½" means partial support. The line under the game's name also says "Full controller support", "Partial controller support" or "No controller support", and so does the detail page.

The information comes from the Steam store (the same categories shown on a store page, with the Steam Deck rating as a second opinion). Games from other launchers are matched to their Steam store page by exact title, so a game that is not sold on Steam shows no mark. Lumen fills this in quietly after a scan, so on a big library the marks appear over a few minutes the first time. Turn the marks off in Settings, Big Screen, "Controller icon on games".

The vibes card in Big Screen is pinned at the top right of Home, so it stays in place while you move through the rows. Its games are in the matching picks row.

The Big Screen outro now ends on a big glowing "GG" with "Good game. See you soon." under it, then hands back to the desktop view.

## The Big Screen menu

All settings opened from that menu shows only what Big Screen can use: the Big Screen page leads, and the desktop sidebar, the window layout, the cover size in the desktop grid, the desktop background and the keyboard shortcuts are left out. The same panel opened from the desktop view still has everything.

The first entry in the Big Screen menu is **Resume**, which starts the game you played last and closes the menu. With nothing played yet it simply says "Close menu". The rest of the menu is scanning, the look and sound cycles, all settings, power and the way out of Big Screen.

## Controller in windows

Settings and the other windows take the controller too, in both views. The stick or D-pad moves between the controls, A presses the one you are on, left and right slide sliders and change dropdowns, LB and RB switch the settings tabs, and B closes the window. The control you are on has a ring around it, and a hint bar appears at the bottom of the window while a controller is connected. Moving the mouse hides the ring again.

## Installing from Lumen, with progress

Press Install on a game you own and Lumen keeps you where you are: it asks the game's launcher to start the download in the background and pulls the Lumen window back to the front, then follows the progress itself.

- Steam writes its download progress into its own `appmanifest` files, so Lumen reads them and shows real bytes, speed and time left.
- Epic reports only that a game is still incomplete, so it shows as installing without a percentage. The other launchers say nothing readable, so a game you just started shows as "Asking the launcher…" until the next scan finds it installed.
- Progress shows in three places: a bar across the game's tile, a Downloads list at the bottom of the desktop sidebar, and a chip in the Big Screen header with the same bar on the tile and under the game's name.
- When a download finishes, Lumen rescans by itself, so the game turns playable without a click.

What Lumen cannot do: the download itself belongs to the launcher, so Steam still shows its own install window the first time it starts a game, and pausing or changing the install folder happens there.

### When a game sits in the queue

Steam often takes an install and then does nothing with it. That is Steam's own download queue, not Lumen, and it happens when the queue is paused, when another download is ahead of this one, when Steam is set to download only at certain hours, or when a game is running and "allow downloads during gameplay" is off.

Lumen now reads which of those it is, from the `StateFlags` Steam writes next to the game:

- **Waiting its turn in the launcher** means the job exists but Steam is not working on it.
- **Paused in the launcher** means someone stopped it, and it keeps the bytes already on disk.
- Both show an amber bar instead of the accent one, so a stuck install does not look like a slow one.

The button that starts it again lives in the launcher, so Lumen takes you there. A waiting download gets a **Start it in the launcher** button in the Downloads list, and pressing Install on that game again, or A in Big Screen, opens the launcher's own downloads list instead of asking for the same install twice. Press Resume there and Lumen picks the progress up on its own.

## Store info in Big Screen

The game page in Big Screen now shows what the desktop view shows: the description, review summary and score, price (with the discount), how many people are playing right now, release date, Metacritic, developer, achievements, and the game's top tags. A shorter line of the same facts sits under the name of the game you are on, in the Home view.

The data comes from Steam's own store API. SteamDB has no public API and asks programs not to read its pages, so Lumen never scrapes it; the SteamDB page stays a link in the desktop view.

## Answering a launcher window with the controller

Some launchers open their own window on top of Lumen, and Steam always does: pressing Install shows its "Install to which drive" box. Those windows know nothing about a controller, which is a dead end on a TV.

While Big Screen is on and you start an install, Lumen lends the controller to that window: the stick moves the mouse pointer, A clicks, X right-clicks, B is Escape, Y and the Menu button are Enter, the bumpers are Tab, and the D-pad works as the arrow keys. Hold the right trigger to move the pointer faster. It only works while another program is in front, so it never doubles up with Lumen's own controls, and it stops by itself as soon as the download starts (or after four minutes). Turn it off in Settings, Big Screen, "Controller as a mouse for launcher windows". Windows only.

Lumen cannot remove Steam's own Install box: it belongs to Steam, which decides the drive and the shortcuts there.

When a game starts, Lumen goes quiet by itself: the music stops at once and the live wallpaper stops drawing while another program is in front, so nothing of Lumen is heard or drawn over your game. Both come back when you return to Lumen.

## Calm space music

Background music has six more pieces, all generated live like the first ones: Deep space, Nebula (two clouds of sound drifting past each other), Orbit (a slow music-box line over a drone), Pulsar (one patient blip and its echo), Tides (long swells) and Driftwood (a few wooden notes falling through a wide room). Shuffle plays a different calm piece every five minutes, so a long evening never repeats. Settings, Sound & music, or the Music line in the Big Screen menu.

## Lumen in your language

Settings, General, **Language**. Lumen follows your Windows language on its own, or you can pick one:
English, German, Spanish, French, Croatian, Italian, Macedonian, Polish, Portuguese, Russian, Serbian
or Turkish. The menus, buttons, the Big Screen menu and hints, the game pages, the power menu, the
screensaver and the whole vibes card change with it.

Everything on the two main screens now goes through the translation: the home page and its shelves,
the list view's column headings, the sidebar, the empty states, the right-click menu, the game page
with its store details, how long ago you last played and for how long, and the Big Screen tiles,
detail page and hints. Game names come from the launchers and stay exactly as they are, and the
longer help texts inside Settings are still English for now. Anything a translation has not covered falls back to English
rather than showing a blank, and the percentage next to a language in the list says how much of it
is done. More languages are easy to add: each one is a single file under `src/lib/lang/`, keyed by
the English sentence.

## Screensaver

After three quiet minutes (any key, click or controller movement counts as not quiet) the screen turns into a window on space: Warp, Nebula, Planet rise, Comets, Galaxy, Ringed world or Low orbit. Shuffle changes the view every ninety seconds. The clock drifts slowly around the screen so no part of a TV panel stays lit, and everything is dark and slow on purpose. Any button brings Lumen back, and that first press is swallowed so it cannot start a game by accident.

The screensaver also carries the same information the vibes card does. One panel at a time fades in somewhere on the screen, stays for about fourteen seconds and fades out again: the clock and date, the weather where you are, headlines about your own games, Steam's new releases and the world's most played with their player counts. Each panel appears in a new spot, so nothing stays lit in one place.

Settings, Big Screen: start after 1 to 20 minutes or off, which view, Big Screen only or everywhere, whether the clock shows, and "Show weather and game news on the screensaver" for the rest of the panels.

## License and names

Lumen is free software under the MIT license; see [LICENSE](LICENSE). It is an independent project with no connection to Valve, Epic Games, GOG, Electronic Arts, Ubisoft, Microsoft, Blizzard, Amazon, Nintendo or Sony. Steam, Epic Games Store, GOG, EA app, Ubisoft Connect, Xbox, Battle.net and Amazon Games are the trademarks of their owners and are used here only to say which launcher a game comes from. No artwork, sound or interface from a console or a launcher is shipped with Lumen: every icon, tune and animation in it was made for it. Game artwork is fetched from the stores' own public addresses and belongs to the publishers.

OmniConsole, XFSET and Quiver Launcher are separate projects with their own licenses. Lumen links to them and, in Quiver's case, reads the files it leaves on your PC; none of their code is bundled or copied.
