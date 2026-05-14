import { Composition } from "remotion";
import { DoorstepReel } from "./DoorstepReel.jsx";
import { ProductReel } from "./ProductReel.jsx";
import { RoleplayReel } from "./RoleplayReel.jsx";
import { ServiceReel } from "./ServiceReel.jsx";

export const Root = () => {
  return (
    <>
      <Composition
        id="ProductReel"
        component={ProductReel}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          title: "Coach Tabby Shoulder Bag 26",
          brand: "Coach",
          image_url:
            "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=84",
          price_pkr: 153738,
          advance_due_pkr: 76869,
          balance_due_pkr: 76869,
          caption:
            "Now open for USA preorder. DM to confirm size/shade.",
        }}
      />
      <Composition
        id="ServiceReel"
        component={ServiceReel}
        durationInFrames={600}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          instagramHandle: "@globalbestie",
        }}
      />
      <Composition
        id="DoorstepReel"
        component={DoorstepReel}
        durationInFrames={600}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          instagramHandle: "@globalbestie",
        }}
      />
      <Composition
        id="RoleplayReel"
        component={RoleplayReel}
        durationInFrames={600}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          instagramHandle: "@globalbestie",
        }}
      />
    </>
  );
};
