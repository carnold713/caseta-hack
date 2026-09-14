Drop Lutron's product photos here and the app uses them instead of its drawings.

File names (PNG, straight-on, cropped tight to the remote's body, transparent or white background):

    PJ2-3BRL.png      5 buttons: on, raise/lower split diagonally around the round favorite, off
    PJ2-3BRL-classic.png   older 5-button style with raise and lower bars
    PJ2-2BRL.png      4 buttons: on, raise, lower, off
    PJ2-3B.png        3 buttons: on, favorite, off
    PJ2-2B.png        2 buttons: on, off
    PJ2-4B.png        4 scene buttons
    PJ2-P.png         paddle
    PJ2-1B.png        1 button

Strip a studio background first: python scripts/strip_bg.py photo.jpg web/img/picos/PJ2-3BRL.png

Add a finish suffix for a specific colour, e.g. PJ2-3BRL-black.png. The
tappable hotspots are drawn over the photo using the real device proportions
(1.25 x 2.62 in), so keep the crop tight.
