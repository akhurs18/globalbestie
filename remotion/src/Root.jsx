import { Composition } from "remotion";
import { ProductReel } from "./ProductReel.jsx";

export const Root = () => {
  return (
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
  );
};
