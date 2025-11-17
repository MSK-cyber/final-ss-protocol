import TerserPlugin from "terser-webpack-plugin";

export default {
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: true, // Removes console.* calls
          },
        },
      }),
    ],
  },
};
